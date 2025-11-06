import { PrismaClient, Role, COIStatus, FileKind } from "@prisma/client";
import { hash as argonHash } from "@node-rs/argon2";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

function token(n = 24) {
  return randomBytes(n).toString("hex");
}
function daysFromNow(d: number) {
  const dt = new Date();
  dt.setDate(dt.getDate() + d);
  return dt;
}

async function main() {
  // ---------- Buildings ----------
  const b1 = await prisma.building.create({
    data: {
      name: "Sunset Towers HOA",
      address: "123 Ocean Ave, Miami, FL 33139",
    },
  });

  const b2 = await prisma.building.create({
    data: {
      name: "Downtown Plaza Condos",
      address: "987 Main St, Austin, TX 78701",
    },
  });

  // ---------- Requirement Templates (1 activo, 1 inactivo por building) ----------
  await prisma.requirementTemplate.create({
    data: {
      building: { connect: { id: b1.id } },
      certificateHolderText:
        "Sunset Towers HOA, 123 Ocean Ave, Miami, FL 33139",
      generalLiabMin: 1_000_000,
      autoLiabMin: 500_000,
      umbrellaMin: 1_000_000,
      additionalInsuredText:
        "Property Manager must be listed as Additional Insured.",
      workersCompRequired: true,
      active: true,
    },
  });
  await prisma.requirementTemplate.create({
    data: {
      building: { connect: { id: b1.id } },
      certificateHolderText: "Sunset (legacy)",
      generalLiabMin: 300_000,
      autoLiabMin: 100_000,
      umbrellaMin: 300_000,
      additionalInsuredText: "Old text",
      workersCompRequired: false,
      active: false,
    },
  });

  await prisma.requirementTemplate.create({
    data: {
      building: { connect: { id: b2.id } },
      certificateHolderText:
        "Downtown Plaza Assoc., 987 Main St, Austin, TX 78701",
      generalLiabMin: 2_000_000,
      autoLiabMin: 1_000_000,
      umbrellaMin: 2_000_000,
      additionalInsuredText: "Include HOA as Additional Insured.",
      workersCompRequired: true,
      active: true,
    },
  });

  // ---------- Vendors ----------
  const v1 = await prisma.vendor.create({
    data: {
      legalName: "John Doe Plumbing, Inc.",
      contactEmail: "vendor1@example.com",
      contactPhone: "+13055551234",
    },
  });
  const v2 = await prisma.vendor.create({
    data: {
      legalName: "ACME Electrical Services LLC",
      contactEmail: "vendor2@example.com",
      contactPhone: "+15125550123",
    },
  });

  // ---------- Users ----------
  const password = await argonHash("password123");

  await prisma.user.create({
    data: {
      email: "admin@example.com",
      password,
      role: Role.ADMIN,
      name: "Admin",
    },
  });

  await prisma.user.create({
    data: {
      email: "vendor1@example.com",
      password,
      role: Role.VENDOR,
      vendor: { connect: { id: v1.id } },
      name: "Vendor One",
    },
  });

  await prisma.user.create({
    data: {
      email: "guard@example.com",
      password,
      role: Role.GUARD,
      name: "Guard",
    },
  });

  // ---------- COIs (varios estados y fechas) ----------
  // 1) PENDING, con archivos, fechas a completar por OCR
  const coiPending = await prisma.cOI.create({
    data: {
      vendor: { connect: { id: v1.id } },
      building: { connect: { id: b1.id } },
      status: COIStatus.PENDING,
      notes: "Subido por broker (pendiente de revisión & OCR)",
      files: {
        create: [
          {
            url: "https://example-bucket.s3.amazonaws.com/uploads/sample-tally-v1.pdf",
            kind: FileKind.CERTIFICATE,
          },
        ],
      },
    },
    include: { files: true },
  });

  // 2) APPROVED, fechas y límites completos
  const coiApproved = await prisma.cOI.create({
    data: {
      vendor: { connect: { id: v1.id } },
      building: { connect: { id: b1.id } },
      insuredName: "John Doe Plumbing, Inc.",
      producer: "Acme Brokerage Co.",
      generalLiabLimit: 1_000_000,
      autoLiabLimit: 500_000,
      umbrellaLimit: 1_000_000,
      workersComp: true,
      additionalInsured: true,
      waiverOfSubrogation: true,
      certificateHolder: "Sunset Towers HOA, 123 Ocean Ave, Miami, FL 33139",
      effectiveDate: daysFromNow(-100),
      expirationDate: daysFromNow(265),
      status: COIStatus.APPROVED,
      notes: "Cumple requisitos actuales",
      files: {
        create: [
          {
            url: "https://example-bucket.s3.amazonaws.com/uploads/approved-v1.pdf",
            kind: FileKind.CERTIFICATE,
          },
          {
            url: "https://example-bucket.s3.amazonaws.com/uploads/endorsement-v1.pdf",
            kind: FileKind.ENDORSEMENT,
          },
        ],
      },
    },
    include: { files: true },
  });

  // 3) REJECTED (con motivo en notes), expirado
  const coiRejected = await prisma.cOI.create({
    data: {
      vendor: { connect: { id: v2.id } },
      building: { connect: { id: b2.id } },
      insuredName: "ACME Electrical Services LLC",
      producer: "Bright Insurance LLC",
      generalLiabLimit: 200_000, // menor al mínimo requerido -> rechazado
      autoLiabLimit: 100_000,
      umbrellaLimit: 0,
      workersComp: false,
      additionalInsured: false,
      waiverOfSubrogation: false,
      certificateHolder: "Downtown Plaza Assoc., 987 Main St, Austin, TX 78701",
      effectiveDate: daysFromNow(-400),
      expirationDate: daysFromNow(-35), // expirado
      status: COIStatus.REJECTED,
      notes: "General Liability menor al requerido; falta Workers Comp",
      files: {
        create: [
          {
            url: "https://example-bucket.s3.amazonaws.com/uploads/rejected-v2.pdf",
            kind: FileKind.CERTIFICATE,
          },
        ],
      },
    },
    include: { files: true },
  });

  // 4) PENDING a punto de vencer (para probar recordatorios D30/D15/D7)
  const coiPendingExpSoon = await prisma.cOI.create({
    data: {
      vendor: { connect: { id: v2.id } },
      building: { connect: { id: b2.id } },
      insuredName: "ACME Electrical Services LLC",
      producer: "Bright Insurance LLC",
      generalLiabLimit: 2_000_000,
      autoLiabLimit: 1_000_000,
      umbrellaLimit: 2_000_000,
      workersComp: true,
      additionalInsured: true,
      waiverOfSubrogation: true,
      certificateHolder: "Downtown Plaza Assoc., 987 Main St, Austin, TX 78701",
      effectiveDate: daysFromNow(-300),
      expirationDate: daysFromNow(10), // vence pronto
      status: COIStatus.PENDING,
      notes: "En revisión; a punto de vencer",
      files: {
        create: [
          {
            url: "https://example-bucket.s3.amazonaws.com/uploads/pending-exp-soon.pdf",
            kind: FileKind.CERTIFICATE,
          },
        ],
      },
    },
    include: { files: true },
  });

  // ---------- CoiRequests (tokens públicos) ----------
  await prisma.coiRequest.create({
    data: {
      token: token(12),
      building: { connect: { id: b1.id } },
      vendor: { connect: { id: v1.id } },
      expiresAt: daysFromNow(7),
    },
  });
  await prisma.coiRequest.create({
    data: {
      token: token(12),
      building: { connect: { id: b2.id } },
      vendor: { connect: { id: v2.id } },
      expiresAt: daysFromNow(14),
    },
  });

  // ---------- NotificationLog (para evitar SMS duplicados) ----------
  await prisma.notificationLog.createMany({
    data: [
      { coiId: coiApproved.id, kind: "SMS_EXPIRY", tag: "D30" },
      { coiId: coiPendingExpSoon.id, kind: "SMS_EXPIRY", tag: "D15" },
    ],
    skipDuplicates: true,
  });

  // ---------- AuditLog (aprobación / rechazo) ----------
  await prisma.auditLog.createMany({
    data: [
      {
        entity: "COI",
        entityId: coiApproved.id,
        action: "REVIEW.APPROVED",
        actorId: "system",
        details: "Aprobado por seed",
      },
      {
        entity: "COI",
        entityId: coiRejected.id,
        action: "REVIEW.REJECTED",
        actorId: "system",
        details: "Límites y WC no cumplen",
      },
    ],
  });

  // ---------- BrokerInbox (trazas de ingestión) ----------
  await prisma.brokerInbox.createMany({
    data: [
      {
        source: "EMAIL",
        externalId: "msg-001@example",
        vendorId: v1.id,
        buildingId: b1.id,
        status: "RECEIVED",
        meta: {
          subject: "tally for [V:" + v1.id + "][B:" + b1.id + "]",
          attachments: [{ url: coiPending.files[0].url, kind: "CERTIFICATE" }],
        } as any,
      },
      {
        source: "API",
        externalId: "api-xyz-123",
        vendorId: v2.id,
        buildingId: b2.id,
        status: "ATTACHED",
        meta: {
          provider: "Broker API",
          files: [{ url: coiPendingExpSoon.files[0].url, kind: "CERTIFICATE" }],
        } as any,
      },
    ],
  });

  // ---------- BuildingIntegration (webhook de acceso / API) ----------
  await prisma.buildingIntegration.create({
    data: {
      buildingId: b1.id,
      kind: "ACCESS_WEBHOOK",
      url: "https://access.example.com/webhook",
      apiKey: "access_key_demo",
      active: true,
    },
  });
  await prisma.buildingIntegration.create({
    data: {
      buildingId: b2.id,
      kind: "ACCESS_API",
      url: "https://access.example.com/api",
      apiKey: "access_api_demo",
      active: true,
    },
  });

  console.log("✅ Seed completo.");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
