import { type Database, type TenantVoiceProfile, tenantVoiceProfiles } from "@okito/db";
import { eq } from "drizzle-orm";
import { BadRequestError, NotFoundError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";

/**
 * Voice cloning (vague 4) : clone ElevenLabs de la voix du patron, un profil
 * par tenant. Le clonage est REFUSÉ sans preuve de consentement explicite
 * (qui consent + texte du consentement) — elle est stockée avec le profil.
 *
 * Le pipeline voix (stream v3, /turn) interroge `voiceIdFor(tenantId)` :
 * profil actif → voix clonée, sinon voix par défaut (ELEVENLABS_VOICE_ID).
 */

const ELEVENLABS_VOICES_URL = "https://api.elevenlabs.io/v1/voices";

/** Bornes des échantillons : ElevenLabs IVC accepte jusqu'à 25 fichiers / 10 Mo. */
const MAX_SAMPLES = 10;
const MAX_SAMPLE_BYTES = 8 * 1024 * 1024;

export interface VoiceSample {
  audio: Buffer;
  mime: string;
  filename: string;
}

export interface CreateVoiceProfileInput {
  tenantId: string;
  label?: string;
  samples: VoiceSample[];
  consent: { givenBy: string; text: string };
}

/** Vue publique du profil — jamais de données audio, juste les métadonnées. */
export interface VoiceProfileView {
  voiceId: string;
  label: string;
  consentGivenBy: string;
  consentAt: Date;
  status: string;
  createdAt: Date;
}

export class VoiceProfileService {
  constructor(
    private readonly db: Database,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async get(tenantId: string): Promise<VoiceProfileView | null> {
    const profile = await this.find(tenantId);
    return profile ? toView(profile) : null;
  }

  /** voiceId du clone si le tenant en a un actif, sinon undefined (voix défaut). */
  async voiceIdFor(tenantId: string): Promise<string | undefined> {
    const profile = await this.find(tenantId);
    return profile?.status === "active" ? profile.voiceId : undefined;
  }

  /**
   * Clone la voix depuis les échantillons audio et enregistre le profil.
   * Un profil existant est remplacé : l'ancien clone est supprimé côté
   * ElevenLabs pour ne pas accumuler de voix orphelines.
   */
  async create(input: CreateVoiceProfileInput): Promise<VoiceProfileView> {
    const givenBy = input.consent.givenBy.trim();
    const consentText = input.consent.text.trim();
    if (!givenBy || !consentText) {
      throw new BadRequestError(
        "Consentement requis : qui consent et le texte du consentement",
        "consent_required",
      );
    }
    if (input.samples.length === 0) {
      throw new BadRequestError("Au moins un échantillon audio requis", "samples_required");
    }
    if (input.samples.length > MAX_SAMPLES) {
      throw new BadRequestError(`Maximum ${MAX_SAMPLES} échantillons`, "too_many_samples");
    }
    for (const sample of input.samples) {
      if (sample.audio.length === 0 || sample.audio.length > MAX_SAMPLE_BYTES) {
        throw new BadRequestError("Échantillon vide ou trop volumineux (max 8 Mo)", "bad_sample");
      }
    }

    const existing = await this.find(input.tenantId);
    const label = input.label?.trim() || "Voix du patron";
    const voiceId = await this.cloneVoice(input.tenantId, label, input.samples);

    if (existing) {
      await this.deleteRemoteVoice(existing.voiceId);
      await this.db
        .update(tenantVoiceProfiles)
        .set({
          voiceId,
          label,
          consentGivenBy: givenBy,
          consentText,
          consentAt: new Date(),
          status: "active",
          updatedAt: new Date(),
        })
        .where(eq(tenantVoiceProfiles.tenantId, input.tenantId));
    } else {
      await this.db.insert(tenantVoiceProfiles).values({
        tenantId: input.tenantId,
        voiceId,
        label,
        consentGivenBy: givenBy,
        consentText,
      });
    }

    logger.info({ tenantId: input.tenantId, voiceId }, "voice: clone créé");
    const profile = await this.find(input.tenantId);
    if (!profile) throw new NotFoundError("Profil vocal introuvable après création");
    return toView(profile);
  }

  /** Supprime le clone (côté ElevenLabs, best effort) et le profil. */
  async remove(tenantId: string): Promise<void> {
    const profile = await this.find(tenantId);
    if (!profile) throw new NotFoundError("Aucun profil vocal pour ce tenant");
    await this.deleteRemoteVoice(profile.voiceId);
    await this.db.delete(tenantVoiceProfiles).where(eq(tenantVoiceProfiles.tenantId, tenantId));
    logger.info({ tenantId, voiceId: profile.voiceId }, "voice: clone supprimé");
  }

  private async find(tenantId: string): Promise<TenantVoiceProfile | undefined> {
    const rows = await this.db
      .select()
      .from(tenantVoiceProfiles)
      .where(eq(tenantVoiceProfiles.tenantId, tenantId))
      .limit(1);
    return rows[0];
  }

  /** Instant voice cloning ElevenLabs : POST multipart /v1/voices/add. */
  private async cloneVoice(
    tenantId: string,
    label: string,
    samples: VoiceSample[],
  ): Promise<string> {
    const form = new FormData();
    form.append("name", `okito-${tenantId.slice(0, 8)}-${label}`.slice(0, 100));
    for (const sample of samples) {
      form.append(
        "files",
        new Blob([new Uint8Array(sample.audio)], { type: sample.mime }),
        sample.filename,
      );
    }
    const res = await this.fetchImpl(`${ELEVENLABS_VOICES_URL}/add`, {
      method: "POST",
      headers: { "xi-api-key": this.apiKey },
      body: form,
    });
    if (!res.ok) {
      logger.error({ status: res.status, tenantId }, "ElevenLabs: clonage échoué");
      throw new BadRequestError(
        `Clonage refusé par ElevenLabs (HTTP ${res.status})`,
        "clone_failed",
      );
    }
    const body = (await res.json()) as { voice_id?: string };
    if (!body.voice_id) {
      throw new BadRequestError("ElevenLabs n'a pas renvoyé de voice_id", "clone_failed");
    }
    return body.voice_id;
  }

  private async deleteRemoteVoice(voiceId: string): Promise<void> {
    try {
      await this.fetchImpl(`${ELEVENLABS_VOICES_URL}/${voiceId}`, {
        method: "DELETE",
        headers: { "xi-api-key": this.apiKey },
      });
    } catch (err) {
      // Best effort : le profil local reste la source de vérité.
      logger.warn({ err, voiceId }, "ElevenLabs: suppression du clone échouée");
    }
  }
}

function toView(profile: TenantVoiceProfile): VoiceProfileView {
  return {
    voiceId: profile.voiceId,
    label: profile.label,
    consentGivenBy: profile.consentGivenBy,
    consentAt: profile.consentAt,
    status: profile.status,
    createdAt: profile.createdAt,
  };
}
