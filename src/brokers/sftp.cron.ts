import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

@Injectable()
export class BrokersSftpCron {
  private logger = new Logger(BrokersSftpCron.name);

  @Cron(CronExpression.EVERY_10_MINUTES)
  async poll() {
    // Conecta a SFTP, lista /yally_Inbox/*.pdf, sube a S3, registra BrokerInbox
    // Llama flujo común (AV + OCR + crear/actualizar COI)
    this.logger.debug("SFTP poll tick");
  }
}
