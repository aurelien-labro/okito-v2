import {
  LoggingNotifier,
  type NotificationChannel,
  type NotificationInput,
  type NotificationResult,
  type Notifier,
} from "./notifier.js";

/**
 * Notifier qui route par canal vers une implémentation dédiée.
 *
 * Permet de combiner plusieurs providers sans héritage diamant :
 *   - email → ResendNotifier
 *   - whatsapp → TwilioWhatsAppNotifier (puis 360dialog plus tard)
 *   - sms → (Twilio plus tard)
 *
 * Hérite de LoggingNotifier pour fallback log sur les canaux non-mappés
 * et pour réutiliser la composition multi-canal de notifyReservationCreated/Cancelled.
 */
export class CompositeNotifier extends LoggingNotifier {
  constructor(private readonly byChannel: Partial<Record<NotificationChannel, Notifier>>) {
    super();
  }

  override async send(input: NotificationInput): Promise<NotificationResult> {
    const delegate = this.byChannel[input.channel];
    if (delegate) return delegate.send(input);
    return super.send(input);
  }
}
