import { hash as argonHash } from "@node-rs/argon2";
import {
  AccessStatus,
  COI,
  COIStatus,
  PrismaClient,
  UserRole,
  VendorAuthStatus,
} from "@prisma/client";
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
  console.log("🌱 Starting ProofHolder seed v2.0...\n");

  // ========================================
  // 1. ORGANIZATIONS (Multi-tenancy)
  // ========================================
  console.log("📦 Creating Organizations...");

  const org1 = await prisma.organization.create({
    data: {
      name: "Acme Property Management",
      plan: "professional",
      stripeCustomerId: "cus_demo_acme123",
    },
  });

  const org2 = await prisma.organization.create({
    data: {
      name: "Sunset Properties LLC",
      plan: "starter",
    },
  });

  console.log(`✅ Created 2 organizations\n`);

  // ========================================
  // 2. USERS (7 roles granulares)
  // ========================================
  console.log("👥 Creating Users...");

  const password = await argonHash("password123");

  // Account Owner (CEO/Owner)
  const accountOwner = await prisma.user.create({
    data: {
      email: "ceo@acme.com",
      password,
      role: UserRole.ACCOUNT_OWNER,
      organizationId: org1.id,
      firstName: "John",
      lastName: "Smith",
      phone: "+13055551000",
      emailVerifiedAt: new Date(),
    },
  });

  // Portfolio Manager (Senior)
  const portfolioManager = await prisma.user.create({
    data: {
      email: "portfolio@acme.com",
      password,
      role: UserRole.PORTFOLIO_MANAGER,
      organizationId: org1.id,
      firstName: "Sarah",
      lastName: "Johnson",
      phone: "+13055551001",
      emailVerifiedAt: new Date(),
    },
  });

  // Property Manager (día a día)
  const propertyManager = await prisma.user.create({
    data: {
      email: "pm@acme.com",
      password,
      role: UserRole.PROPERTY_MANAGER,
      organizationId: org1.id,
      firstName: "Mike",
      lastName: "Davis",
      phone: "+13055551002",
      emailVerifiedAt: new Date(),
    },
  });

  // Building Owner (invitado externo)
  const buildingOwner = await prisma.user.create({
    data: {
      email: "owner@sunset.com",
      password,
      role: UserRole.BUILDING_OWNER,
      organizationId: org2.id,
      firstName: "Robert",
      lastName: "Williams",
      phone: "+13055551003",
      emailVerifiedAt: new Date(),
    },
  });

  console.log(`✅ Created 4 admin/owner users\n`);

  // ========================================
  // 3. BUILDINGS (con org, city, state, etc.)
  // ========================================
  console.log("🏢 Creating Buildings...");

  const building1 = await prisma.building.create({
    data: {
      name: "Sunset Towers HOA",
      address: "123 Ocean Ave",
      city: "Miami",
      state: "FL",
      zipCode: "33139",
      organizationId: org1.id,
      createdBy: accountOwner.id,
    },
  });

  const building2 = await prisma.building.create({
    data: {
      name: "Downtown Plaza Condos",
      address: "987 Main St",
      city: "Austin",
      state: "TX",
      zipCode: "78701",
      organizationId: org1.id,
      createdBy: propertyManager.id,
    },
  });

  const building3 = await prisma.building.create({
    data: {
      name: "Oceanview Apartments",
      address: "456 Beach Blvd",
      city: "San Diego",
      state: "CA",
      zipCode: "92101",
      organizationId: org2.id,
      ownerId: buildingOwner.id,
      createdBy: buildingOwner.id,
    },
  });

  console.log(`✅ Created 3 buildings\n`);

  // ========================================
  // 4. USER BUILDING ACCESS (Scoping)
  // ========================================
  console.log("🔐 Creating User Building Access (scoping)...");

  // Portfolio Manager ve todos los buildings de org1
  await prisma.userBuildingAccess.createMany({
    data: [
      {
        userId: portfolioManager.id,
        buildingId: building1.id,
        assignedBy: accountOwner.id,
      },
      {
        userId: portfolioManager.id,
        buildingId: building2.id,
        assignedBy: accountOwner.id,
      },
    ],
  });

  // Property Manager solo ve building1
  await prisma.userBuildingAccess.create({
    data: {
      userId: propertyManager.id,
      buildingId: building1.id,
      assignedBy: portfolioManager.id,
    },
  });

  console.log(`✅ Created user building access\n`);

  // ========================================
  // 5. REQUIREMENT TEMPLATES (detallados)
  // ========================================
  console.log("📋 Creating Requirement Templates...");

  await prisma.requirementTemplate.create({
    data: {
      buildingId: building1.id,
      name: "Standard Requirements 2024",
      active: true,

      // General Liability
      glRequired: true,
      glMinOccurrence: 1000000,
      glMinAggregate: 2000000,

      // Auto
      autoRequired: true,
      autoMinCombined: 1000000,

      // Umbrella
      umbrellaRequired: true,
      umbrellaMinLimit: 5000000,

      // Workers Comp
      wcRequired: true,

      // Additional requirements
      additionalInsuredRequired: true,
      waiverSubrogationRequired: true,
      primaryNonContribRequired: false,
      noticeOfCancelMin: 30,

      // Holder info
      holderName: "Sunset Towers HOA",
      holderAddress: "123 Ocean Ave, Miami, FL 33139",
      additionalInsuredText:
        "Property Manager and HOA must be listed as Additional Insured",
    },
  });

  // Legacy requirement (inactive)
  await prisma.requirementTemplate.create({
    data: {
      buildingId: building1.id,
      name: "Legacy Requirements 2023",
      active: false,
      glRequired: true,
      glMinOccurrence: 500000,
      glMinAggregate: 1000000,
      autoRequired: false,
      umbrellaRequired: false,
      wcRequired: true,
      additionalInsuredRequired: true,
      holderName: "Sunset Towers HOA (Old)",
      holderAddress: "123 Ocean Ave, Miami, FL 33139",
    },
  });

  await prisma.requirementTemplate.create({
    data: {
      buildingId: building2.id,
      name: "Downtown Plaza Requirements",
      active: true,
      glRequired: true,
      glMinOccurrence: 2000000,
      glMinAggregate: 4000000,
      autoRequired: true,
      autoMinCombined: 1000000,
      umbrellaRequired: false,
      wcRequired: true,
      additionalInsuredRequired: true,
      waiverSubrogationRequired: false,
      noticeOfCancelMin: 30,
      holderName: "Downtown Plaza Condominium Association",
      holderAddress: "987 Main St, Austin, TX 78701",
      additionalInsuredText:
        "Association and Managing Agent as Additional Insured",
    },
  });

  await prisma.requirementTemplate.create({
    data: {
      buildingId: building3.id,
      name: "Oceanview Standard Requirements",
      active: true,
      glRequired: true,
      glMinOccurrence: 1000000,
      glMinAggregate: 2000000,
      autoRequired: false,
      umbrellaRequired: false,
      wcRequired: true,
      additionalInsuredRequired: true,
      holderName: "Oceanview Apartments LLC",
      holderAddress: "456 Beach Blvd, San Diego, CA 92101",
    },
  });

  console.log(`✅ Created 4 requirement templates\n`);

  // ========================================
  // 6. VENDORS (con userId y authorization)
  // ========================================
  console.log("🔧 Creating Vendors...");

  // Vendor 1: John Doe Plumbing
  const vendorUser1 = await prisma.user.create({
    data: {
      email: "vendor1@plumbing.com",
      password,
      role: UserRole.VENDOR,
      organizationId: org1.id,
      firstName: "John",
      lastName: "Doe",
      phone: "+13055551234",
      emailVerifiedAt: new Date(),
    },
  });

  const vendor1 = await prisma.vendor.create({
    data: {
      userId: vendorUser1.id,
      companyName: "John Doe Plumbing Inc",
      contactName: "John Doe",
      contactEmail: "vendor1@plumbing.com",
      contactPhone: "+13055551234",
      serviceType: ["plumbing", "water_systems"],
    },
  });

  // Vendor 2: ACME Electrical
  const vendorUser2 = await prisma.user.create({
    data: {
      email: "vendor2@acme-elec.com",
      password,
      role: UserRole.VENDOR,
      organizationId: org1.id,
      firstName: "Alice",
      lastName: "Johnson",
      phone: "+15125550123",
      emailVerifiedAt: new Date(),
    },
  });

  const vendor2 = await prisma.vendor.create({
    data: {
      userId: vendorUser2.id,
      companyName: "ACME Electrical Services LLC",
      contactName: "Alice Johnson",
      contactEmail: "vendor2@acme-elec.com",
      contactPhone: "+15125550123",
      serviceType: ["electrical", "hvac"],
    },
  });

  // Vendor 3: Quick HVAC
  const vendorUser3 = await prisma.user.create({
    data: {
      email: "vendor3@quickhvac.com",
      password,
      role: UserRole.VENDOR,
      firstName: "Bob",
      lastName: "Martinez",
      phone: "+16195551111",
    },
  });

  const vendor3 = await prisma.vendor.create({
    data: {
      userId: vendorUser3.id,
      companyName: "Quick HVAC Solutions",
      contactName: "Bob Martinez",
      contactEmail: "vendor3@quickhvac.com",
      contactPhone: "+16195551111",
      serviceType: ["hvac", "refrigeration"],
    },
  });

  console.log(`✅ Created 3 vendors\n`);

  // ========================================
  // 7. VENDOR BUILDING AUTHORIZATION
  // ========================================
  console.log("✅ Creating Vendor Authorizations...");

  // Vendor1 APPROVED para building1
  await prisma.vendorBuildingAuthorization.create({
    data: {
      vendorId: vendor1.id,
      buildingId: building1.id,
      status: VendorAuthStatus.APPROVED,
      approvedBy: propertyManager.id,
      approvedAt: new Date(),
      notes: "COI verified and approved",
    },
  });

  // Vendor2 APPROVED para building2
  await prisma.vendorBuildingAuthorization.create({
    data: {
      vendorId: vendor2.id,
      buildingId: building2.id,
      status: VendorAuthStatus.APPROVED,
      approvedBy: propertyManager.id,
      approvedAt: new Date(),
    },
  });

  // Vendor2 REJECTED para building1
  await prisma.vendorBuildingAuthorization.create({
    data: {
      vendorId: vendor2.id,
      buildingId: building1.id,
      status: VendorAuthStatus.REJECTED,
      rejectedBy: propertyManager.id,
      rejectedAt: new Date(),
      notes: "Insurance limits insufficient",
    },
  });

  // Vendor3 PENDING para building3
  await prisma.vendorBuildingAuthorization.create({
    data: {
      vendorId: vendor3.id,
      buildingId: building3.id,
      status: VendorAuthStatus.PENDING,
      notes: "Awaiting COI review",
    },
  });

  console.log(`✅ Created vendor authorizations\n`);

  // ========================================
  // 8. TENANTS (inquilinos comerciales)
  // ========================================
  console.log("🏪 Creating Tenants...");

  const tenantUser1 = await prisma.user.create({
    data: {
      email: "tenant1@coffeeshop.com",
      password,
      role: UserRole.TENANT,
      organizationId: org1.id,
      firstName: "Coffee",
      lastName: "Shop Owner",
      emailVerifiedAt: new Date(),
    },
  });

  const tenant1 = await prisma.tenant.create({
    data: {
      userId: tenantUser1.id,
      businessName: "Sunset Coffee Shop",
      contactName: "Maria Garcia",
      contactEmail: "tenant1@coffeeshop.com",
      contactPhone: "+13055552222",
      buildingId: building1.id,
      unitNumber: "101",
      leaseStartDate: daysFromNow(-365),
      leaseEndDate: daysFromNow(365),
      createdBy: propertyManager.id,
    },
  });

  const tenantUser2 = await prisma.user.create({
    data: {
      email: "tenant2@gym.com",
      password,
      role: UserRole.TENANT,
      organizationId: org1.id,
      firstName: "Gym",
      lastName: "Owner",
      emailVerifiedAt: new Date(),
    },
  });

  const tenant2 = await prisma.tenant.create({
    data: {
      userId: tenantUser2.id,
      businessName: "FitLife Gym",
      contactName: "Carlos Rodriguez",
      contactEmail: "tenant2@gym.com",
      contactPhone: "+15125553333",
      buildingId: building2.id,
      unitNumber: "Ground Floor",
      leaseStartDate: daysFromNow(-180),
      leaseEndDate: daysFromNow(545),
      createdBy: propertyManager.id,
    },
  });

  console.log(`✅ Created 2 tenants\n`);

  // ========================================
  // 9. GUARDS (seguridad)
  // ========================================
  console.log("🛡️ Creating Guards...");

  const guardUser1 = await prisma.user.create({
    data: {
      email: "guard1@security.com",
      password,
      role: UserRole.GUARD,
      organizationId: org1.id,
      firstName: "James",
      lastName: "Wilson",
      phone: "+13055554444",
      emailVerifiedAt: new Date(),
    },
  });

  const guard1 = await prisma.guard.create({
    data: {
      userId: guardUser1.id,
      firstName: "James",
      lastName: "Wilson",
      phone: "+13055554444",
      employeeId: "GRD-001",
      createdBy: propertyManager.id,
    },
  });

  const guardUser2 = await prisma.user.create({
    data: {
      email: "guard2@security.com",
      password,
      role: UserRole.GUARD,
      organizationId: org1.id,
      firstName: "Lisa",
      lastName: "Anderson",
      phone: "+13055555555",
      emailVerifiedAt: new Date(),
    },
  });

  const guard2 = await prisma.guard.create({
    data: {
      userId: guardUser2.id,
      firstName: "Lisa",
      lastName: "Anderson",
      phone: "+13055555555",
      employeeId: "GRD-002",
      createdBy: propertyManager.id,
    },
  });

  // Asignar guards a buildings
  await prisma.guardBuildingAssignment.createMany({
    data: [
      {
        guardId: guard1.id,
        buildingId: building1.id,
        assignedBy: propertyManager.id,
      },
      {
        guardId: guard1.id,
        buildingId: building2.id,
        assignedBy: propertyManager.id,
      },
      {
        guardId: guard2.id,
        buildingId: building2.id,
        assignedBy: propertyManager.id,
      },
    ],
  });

  console.log(`✅ Created 2 guards with assignments\n`);

  // ========================================
  // 10. COIs (con campos detallados)
  // ========================================
  console.log("📄 Creating COIs...");

  // COI 1: APPROVED con todos los campos detallados
  const coi1: COI = await prisma.cOI.create({
    data: {
      vendorId: vendor1.id,
      buildingId: building1.id,
      uploadedBy: vendorUser1.id,
      status: COIStatus.APPROVED,

      // OCR extracted
      insuranceCompany: "State Farm Insurance",
      policyNumber: "POL-123456789",
      effectiveDate: daysFromNow(-100),
      expirationDate: daysFromNow(265),
      coverageType: ["general_liability", "auto", "umbrella", "workers_comp"],

      // GL Specific
      glOccurrence: 1000000,
      glAggregate: 2000000,
      glProductsOps: 2000000,
      glPersonalAdv: 1000000,
      glMedicalExp: 5000,
      glDamageRented: 300000,

      // Auto Specific
      autoBodyInjury: 500000,
      autoPropDamage: 500000,
      autoCombined: 1000000,

      // Umbrella
      umbrellaLimit: 5000000,
      umbrellaRetention: 10000,

      // Workers Comp
      wcPerAccident: 1000000,
      wcPerEmployee: 1000000,
      wcPolicyLimit: 1000000,

      // Additional Info
      additionalInsured: true,
      waiverSubrogation: true,
      primaryNonContrib: true,
      noticeOfCancel: 30,

      // Review
      reviewedBy: propertyManager.id,
      reviewedAt: new Date(),
      reviewNotes: "All requirements met. Approved.",

      // Files
      files: {
        create: [
          {
            fileName: "coi-vendor1-building1-cert.pdf",
            fileUrl: "https://s3.example.com/cois/vendor1-cert.pdf",
            fileSize: 245678,
            mimeType: "application/pdf",
          },
          {
            fileName: "coi-vendor1-building1-endorsement.pdf",
            fileUrl: "https://s3.example.com/cois/vendor1-endorsement.pdf",
            fileSize: 89234,
            mimeType: "application/pdf",
          },
        ],
      },
    },
    include: { files: true },
  });

  // COI 2: PENDING (sin revisar)
  const coi2 = await prisma.cOI.create({
    data: {
      vendorId: vendor2.id,
      buildingId: building2.id,
      uploadedBy: vendorUser2.id,
      status: COIStatus.PENDING,

      insuranceCompany: "Nationwide Insurance",
      policyNumber: "POL-987654321",
      effectiveDate: daysFromNow(-30),
      expirationDate: daysFromNow(335),
      coverageType: ["general_liability", "auto", "workers_comp"],

      glOccurrence: 2000000,
      glAggregate: 4000000,
      autoCombined: 1000000,
      wcPolicyLimit: 1000000,

      additionalInsured: true,
      waiverSubrogation: false,

      files: {
        create: [
          {
            fileName: "coi-vendor2-building2.pdf",
            fileUrl: "https://s3.example.com/cois/vendor2-pending.pdf",
            fileSize: 189456,
            mimeType: "application/pdf",
          },
        ],
      },
    },
    include: { files: true },
  });

  // COI 3: REJECTED (límites insuficientes)
  const coi3 = await prisma.cOI.create({
    data: {
      vendorId: vendor2.id,
      buildingId: building1.id,
      uploadedBy: vendorUser2.id,
      status: COIStatus.REJECTED,

      insuranceCompany: "Budget Insurance Co",
      policyNumber: "POL-111222333",
      effectiveDate: daysFromNow(-60),
      expirationDate: daysFromNow(305),
      coverageType: ["general_liability"],

      glOccurrence: 500000, // Insuficiente (req: 1M)
      glAggregate: 1000000, // Insuficiente (req: 2M)

      additionalInsured: false, // Falta
      waiverSubrogation: false, // Falta

      reviewedBy: propertyManager.id,
      reviewedAt: new Date(),
      reviewNotes:
        "REJECTED: GL limits below minimum. AI and Waiver missing. WC required but not provided.",

      files: {
        create: [
          {
            fileName: "coi-vendor2-building1-rejected.pdf",
            fileUrl: "https://s3.example.com/cois/vendor2-rejected.pdf",
            fileSize: 156789,
            mimeType: "application/pdf",
          },
        ],
      },
    },
    include: { files: true },
  });

  // COI 4: EXPIRED (vencido)
  const coi4 = await prisma.cOI.create({
    data: {
      vendorId: vendor3.id,
      buildingId: building3.id,
      uploadedBy: vendorUser3.id,
      status: COIStatus.EXPIRED,

      insuranceCompany: "Old Reliable Insurance",
      policyNumber: "POL-444555666",
      effectiveDate: daysFromNow(-400),
      expirationDate: daysFromNow(-35), // Expirado hace 35 días
      coverageType: ["general_liability", "workers_comp"],

      glOccurrence: 1000000,
      glAggregate: 2000000,
      wcPolicyLimit: 1000000,

      additionalInsured: true,

      reviewedBy: buildingOwner.id,
      reviewedAt: daysFromNow(-40),
      reviewNotes: "Was approved but now expired. Needs renewal.",

      files: {
        create: [
          {
            fileName: "coi-vendor3-building3-expired.pdf",
            fileUrl: "https://s3.example.com/cois/vendor3-expired.pdf",
            fileSize: 198234,
            mimeType: "application/pdf",
          },
        ],
      },
    },
  });

  // COI 5: PENDING expira pronto (para recordatorios)
  const coi5 = await prisma.cOI.create({
    data: {
      vendorId: vendor1.id,
      buildingId: building2.id,
      uploadedBy: vendorUser1.id,
      status: COIStatus.PENDING,

      insuranceCompany: "Quick Insurance",
      policyNumber: "POL-777888999",
      effectiveDate: daysFromNow(-300),
      expirationDate: daysFromNow(15), // Expira en 15 días
      coverageType: ["general_liability", "auto"],

      glOccurrence: 2000000,
      glAggregate: 4000000,
      autoCombined: 1000000,

      additionalInsured: true,

      files: {
        create: [
          {
            fileName: "coi-vendor1-building2-expiring.pdf",
            fileUrl: "https://s3.example.com/cois/vendor1-expiring.pdf",
            fileSize: 176543,
            mimeType: "application/pdf",
          },
        ],
      },
    },
  });

  // COI 6: APPROVED para Tenant 1 (Sunset Coffee Shop)
  const tenantCoi1 = await prisma.cOI.create({
    data: {
      tenantId: tenant1.id,
      buildingId: building1.id,
      status: COIStatus.APPROVED,

      insuranceCompany: "Tenant Insurance Co",
      policyNumber: "TEN-COI-1001",
      effectiveDate: daysFromNow(-45),
      expirationDate: daysFromNow(180),
      coverageType: ["general_liability", "workers_comp"],
      coverageAmounts: {
        insuredName: "Sunset Coffee Shop",
        generalLiabLimit: 1000000,
        workersComp: true,
      } as any,

      additionalInsured: true,
      waiverSubrogation: true,

      files: {
        create: [
          {
            fileName: "tenant1-building1-coi.pdf",
            fileUrl: "https://s3.example.com/cois/tenant1-building1.pdf",
            fileSize: 145678,
            mimeType: "application/pdf",
          },
        ],
      },
    },
  });

  // COI 7: PENDING para Tenant 2 (FitLife Gym)
  const tenantCoi2 = await prisma.cOI.create({
    data: {
      tenantId: tenant2.id,
      buildingId: building2.id,
      status: COIStatus.PENDING,

      insuranceCompany: "ActiveLife Insurance",
      policyNumber: "TEN-COI-2001",
      effectiveDate: daysFromNow(-10),
      expirationDate: daysFromNow(60),
      coverageType: ["general_liability"],
      coverageAmounts: {
        insuredName: "FitLife Gym",
        generalLiabLimit: 2000000,
      } as any,

      additionalInsured: true,

      files: {
        create: [
          {
            fileName: "tenant2-building2-coi-pending.pdf",
            fileUrl: "https://s3.example.com/cois/tenant2-building2-pending.pdf",
            fileSize: 132001,
            mimeType: "application/pdf",
          },
        ],
      },
    },
  });

  console.log(`✅ Created 7 COIs (vendors + tenants)\n`);

  // ========================================
  // 11. COI REQUESTS (tokens públicos)
  // ========================================
  console.log("🔗 Creating COI Requests...");

  await prisma.coiRequest.createMany({
    data: [
      {
        token: token(12),
        vendorId: vendor1.id,
        buildingId: building1.id,
        expiresAt: daysFromNow(7),
        createdBy: propertyManager.id,
      },
      {
        token: token(12),
        vendorId: vendor2.id,
        buildingId: building2.id,
        expiresAt: daysFromNow(14),
        createdBy: propertyManager.id,
      },
      {
        token: token(12),
        vendorId: vendor3.id,
        buildingId: building3.id,
        expiresAt: daysFromNow(30),
        usedAt: new Date(), // Ya usado
        createdBy: buildingOwner.id,
      },
    ],
  });

  console.log(`✅ Created 3 COI requests\n`);

  // ========================================
  // 12. ACCESS LOGS (portería)
  // ========================================
  console.log("🚪 Creating Access Logs...");

  await prisma.accessLog.createMany({
    data: [
      {
        guardId: guard1.id,
        vendorId: vendor1.id,
        buildingId: building1.id,
        action: AccessStatus.ENTRY_GRANTED,
        timestamp: daysFromNow(-1),
      },
      {
        guardId: guard1.id,
        vendorId: vendor2.id,
        buildingId: building1.id,
        action: AccessStatus.ENTRY_DENIED,
        reason: "COI rejected - insurance limits insufficient",
        timestamp: daysFromNow(-1),
      },
      {
        guardId: guard2.id,
        vendorId: vendor2.id,
        buildingId: building2.id,
        action: AccessStatus.ENTRY_GRANTED,
        timestamp: new Date(),
      },
    ],
  });

  console.log(`✅ Created 3 access logs\n`);

  // ========================================
  // 13. AUDIT LOGS
  // ========================================
  console.log("📝 Creating Audit Logs...");

  await prisma.auditLog.createMany({
    data: [
      {
        entityType: "COI",
        entityId: coi1.id,
        action: "APPROVE",
        actorId: propertyManager.id,
        metadata: { notes: "All requirements met" },
      },
      {
        entityType: "COI",
        entityId: coi3.id,
        action: "REJECT",
        actorId: propertyManager.id,
        metadata: {
          notes: "GL limits insufficient",
          required: { glOccurrence: 1000000 },
          provided: { glOccurrence: 500000 },
        },
      },
      {
        entityType: "VendorBuildingAuthorization",
        entityId: vendor1.id,
        action: "APPROVE",
        actorId: propertyManager.id,
      },
      {
        entityType: "COI",
        entityId: tenantCoi1.id,
        action: "APPROVE",
        actorId: propertyManager.id,
        metadata: {
          notes: "Tenant COI reviewed and approved",
        },
      },
    ],
  });

  console.log(`✅ Created audit logs\n`);

  // ========================================
  // 14. NOTIFICATION LOGS
  // ========================================
  console.log("📧 Creating Notification Logs...");

  await prisma.notificationLog.createMany({
    data: [
      {
        userId: vendorUser1.id,
        type: "EMAIL",
        recipient: "vendor1@plumbing.com",
        subject: "COI Approved - Sunset Towers HOA",
        content: "Your Certificate of Insurance has been approved.",
        status: "sent",
        sentAt: new Date(),
      },
      {
        userId: vendorUser2.id,
        type: "EMAIL",
        recipient: "vendor2@acme-elec.com",
        subject: "COI Rejected - Sunset Towers HOA",
        content:
          "Your Certificate of Insurance was rejected. GL limits insufficient.",
        status: "sent",
        sentAt: new Date(),
      },
      {
        userId: vendorUser1.id,
        type: "SMS",
        recipient: "+13055551234",
        content: "Your COI expires in 15 days. Please renew.",
        status: "sent",
        sentAt: daysFromNow(-15),
      },
    ],
  });

  console.log(`✅ Created notification logs\n`);

  // ========================================
  // 15. BROKER INBOX
  // ========================================
  console.log("📥 Creating Broker Inbox entries...");

  await prisma.brokerInbox.createMany({
    data: [
      {
        source: "email",
        sender: "broker@insurance.com",
        subject: "COI for John Doe Plumbing",
        body: "Please find attached COI for your review",
        attachments: [{ url: "https://s3.example.com/cois/vendor1-cert.pdf", filename: "coi.pdf" }] as any,
        status: "ATTACHED",
        metadata: { vendorId: vendor1.id, buildingId: building1.id },
        processedAt: daysFromNow(-2),
      },
      {
        source: "api",
        sender: "api-integration@broker.com",
        body: "API submission",
        status: "RECEIVED",
        metadata: { apiKey: "demo", vendorId: vendor2.id },
      },
    ],
  });

  console.log(`✅ Created broker inbox entries\n`);

  // ========================================
  // 16. BUILDING INTEGRATIONS
  // ========================================
  console.log("🔌 Creating Building Integrations...");

  await prisma.buildingIntegration.createMany({
    data: [
      {
        buildingId: building1.id,
        integrationType: "webhook",
        webhookUrl: "https://access-control.example.com/webhook/building1",
        apiKey: "webhook_key_demo_123",
        active: true,
      },
      {
        buildingId: building2.id,
        integrationType: "webhook",
        webhookUrl: "https://access-control.example.com/webhook/building2",
        apiKey: "webhook_key_demo_456",
        active: true,
      },
    ],
  });

  console.log(`✅ Created building integrations\n`);

  // ========================================
  // SUMMARY
  // ========================================
  console.log("🎉 Seed completed successfully!\n");
  console.log("📊 Summary:");
  console.log(`  - 2 Organizations`);
  console.log(`  - 13 Users (Owners, PMs, Vendors, Tenants, Guards)`);
  console.log(`  - 3 Buildings`);
  console.log(`  - 4 Requirement Templates`);
  console.log(`  - 3 Vendors`);
  console.log(`  - 4 Vendor Authorizations`);
  console.log(`  - 2 Tenants`);
  console.log(`  - 2 Guards`);
  console.log(
    `  - 7 COIs (vendors + tenants: Approved, Pending, Rejected, Expired)`
  );
  console.log(`  - 3 COI Requests`);
  console.log(`  - 3 Access Logs`);
  console.log(`  - Audit Logs, Notifications, Broker Inbox, Integrations\n`);

  console.log("🔑 Test credentials:");
  console.log(
    "  Email: ceo@acme.com | pm@acme.com | vendor1@plumbing.com | guard1@security.com"
  );
  console.log("  Password: password123\n");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
