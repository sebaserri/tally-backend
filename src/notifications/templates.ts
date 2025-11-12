export const tplCoiRequestLink = (vendorName: string, token: string) => `
  <div style="font-family:sans-serif">
    <h2>Solicitud de COI</h2>
    <p>Hola ${vendorName}, por favor sube tu COI en el siguiente enlace:</p>
    <p><a href="${process.env.PUBLIC_APP_URL}/proofholder/requests/${token}" target="_blank">Completar COI</a></p>
    <p>Gracias.</p>
  </div>`;

export const tplCoiRejected = (vendorName: string, coiId: string, reason: string) => `
  <div style="font-family:sans-serif">
    <h2>COI Rechazado</h2>
    <p>Hola ${vendorName}, tu COI fue rechazado por el siguiente motivo:</p>
    <blockquote>${reason || 'Ver comentarios en el sistema'}</blockquote>
    <p>Corrige y vuelve a subir desde:
      <a href="${process.env.PUBLIC_APP_URL}/cois/${coiId}" target="_blank">Tu COI</a>
    </p>
  </div>`;

export const tplCoiExpiry = (vendorName: string, buildingName: string, days: number, dateISO: string) => `
  <div style="font-family:sans-serif">
    <h2>Aviso de Vencimiento de COI</h2>
    <p>El COI de <b>${vendorName}</b> para <b>${buildingName}</b> vence en ${days} días (${dateISO}).</p>
    <p>Por favor sube la renovación desde tu panel.</p>
  </div>`;
