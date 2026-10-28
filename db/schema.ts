import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  numeric,
  unique,
  boolean,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const plans = pgTable("plans", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  description: text(),
  priceMonthly: numeric({ mode: "number" }).notNull().default(0),
  maxUsers: integer(),
  maxWarehouses: integer(),
  maxProducts: integer(),
  isDefault: boolean().notNull().default(false),
  isActive: boolean().notNull().default(true),
  createdAt: timestamp().defaultNow().notNull(),
});

export const organizations = pgTable("organizations", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  industry: text(),
  currency: text().notNull().default("NGN"),
  warehouseName: text(),
  logoUrl: text(),
  registrationNumber: text(),
  address: text(),
  phone: text(),
  email: text(),
  taxName: text(),
  taxRate: numeric({ mode: "number" }).notNull().default(0),
  timezone: text().notNull().default("Africa/Lagos"),
  dateFormat: text().notNull().default("DD/MM/YYYY"),
  subscriptionStatus: text().notNull().default("pending"),
  trialEndsAt: timestamp(),
  planId: uuid().references(() => plans.id),
  currentPeriodEnd: timestamp(),
  cancelAtPeriodEnd: boolean().notNull().default(false),
  renewalAttempts: integer().notNull().default(0),
  lastRenewalAttemptAt: timestamp(),
  setupCompletedAt: timestamp(),
  purchaseSeq: integer().notNull().default(0),
  saleSeq: integer().notNull().default(0),
  receiptSeq: integer().notNull().default(0),
  createdAt: timestamp().defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  passwordHash: text().notNull(),
  name: text().notNull(),
  phone: text(),
  emailVerifiedAt: timestamp(),
  sessionsValidAfter: timestamp(),
  twoFactorSecret: text(),
  twoFactorEnabledAt: timestamp(),
  twoFactorLastStep: integer(),
  createdAt: timestamp().defaultNow().notNull(),
});

export const memberships = pgTable("memberships", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id),
  organizationId: uuid()
    .notNull()
    .references(() => organizations.id),
  role: text().notNull(),
  createdAt: timestamp().defaultNow().notNull(),
});

export const adminUsers = pgTable("admin_users", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .unique()
    .references(() => users.id),
  createdAt: timestamp().defaultNow().notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid().primaryKey().defaultRandom(),
  organizationId: uuid().references(() => organizations.id),
  userId: uuid().references(() => users.id),
  module: text().notNull(),
  action: text().notNull(),
  recordId: text(),
  previousValue: jsonb(),
  newValue: jsonb(),
  ip: text(),
  userAgent: text(),
  createdAt: timestamp().defaultNow().notNull(),
});

export const warehouses = pgTable("warehouses", {
  id: uuid().primaryKey().defaultRandom(),
  organizationId: uuid()
    .notNull()
    .references(() => organizations.id),
  name: text().notNull(),
  address: text(),
  managerName: text(),
  phone: text(),
  status: text().notNull().default("active"),
  createdAt: timestamp().defaultNow().notNull(),
});

export const products = pgTable(
  "products",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    sku: text().notNull(),
    barcode: text(),
    name: text().notNull(),
    description: text(),
    brand: text(),
    imageUrl: text(),
    category: text(),
    unit: text().notNull().default("piece"),
    purchasePrice: numeric({ mode: "number" }).notNull().default(0),
    sellingPrice: numeric({ mode: "number" }).notNull().default(0),
    minStock: integer().notNull().default(0),
    maxStock: integer(),
    currentStock: integer().notNull().default(0),
    status: text().notNull().default("active"),
    supplierId: uuid().references((): AnyPgColumn => suppliers.id),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.organizationId, table.sku),
    index("products_supplier_idx").on(table.organizationId, table.supplierId),
  ],
);

export const stockMovements = pgTable("stock_movements", {
  id: uuid().primaryKey().defaultRandom(),
  organizationId: uuid()
    .notNull()
    .references(() => organizations.id),
  warehouseId: uuid()
    .notNull()
    .references(() => warehouses.id),
  productId: uuid()
    .notNull()
    .references(() => products.id),
  userId: uuid().references(() => users.id),
  type: text().notNull(),
  quantity: integer().notNull(),
  reason: text(),
  previousStock: integer().notNull(),
  newStock: integer().notNull(),
  purchaseId: uuid().references((): AnyPgColumn => purchases.id),
  saleId: uuid().references((): AnyPgColumn => sales.id),
  createdAt: timestamp().defaultNow().notNull(),
});

// Stock of each product in each warehouse. products.currentStock is kept as
// the total across warehouses, changed in the same statement as this.
export const productStock = pgTable(
  "product_stock",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    warehouseId: uuid()
      .notNull()
      .references(() => warehouses.id),
    quantity: integer().notNull().default(0),
    updatedAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.productId, table.warehouseId),
    index("product_stock_warehouse_idx").on(table.organizationId, table.warehouseId),
  ],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid().primaryKey().defaultRandom(),
    identifier: text().notNull(),
    success: boolean().notNull(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [index("login_attempts_identifier_created_at_idx").on(
    table.identifier,
    table.createdAt,
  )],
);

export const catalogOptions = pgTable(
  "catalog_options",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    kind: text().notNull(),
    name: text().notNull(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [unique().on(table.organizationId, table.kind, table.name)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    amount: numeric({ mode: "number" }).notNull(),
    currency: text().notNull().default("NGN"),
    status: text().notNull().default("pending"),
    provider: text(),
    providerReference: text().unique(),
    description: text(),
    kind: text().notNull().default("checkout"),
    channel: text(),
    userId: uuid().references(() => users.id),
    periodStart: timestamp(),
    periodEnd: timestamp(),
    failureReason: text(),
    paidAt: timestamp(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    index("payments_organization_created_at_idx").on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id),
  tokenHash: text().notNull().unique(),
  expiresAt: timestamp().notNull(),
  usedAt: timestamp(),
  createdAt: timestamp().defaultNow().notNull(),
});

export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id),
  tokenHash: text().notNull().unique(),
  expiresAt: timestamp().notNull(),
  usedAt: timestamp(),
  createdAt: timestamp().defaultNow().notNull(),
});

export const invitations = pgTable(
  "invitations",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    email: text().notNull(),
    role: text().notNull(),
    tokenHash: text().notNull().unique(),
    invitedBy: uuid().references(() => users.id),
    expiresAt: timestamp().notNull(),
    acceptedAt: timestamp(),
    revokedAt: timestamp(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    index("invitations_organization_created_at_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    index("invitations_email_idx").on(table.email),
  ],
);

export const subscriptionNotices = pgTable(
  "subscription_notices",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    kind: text().notNull(),
    period: text().notNull(),
    sentAt: timestamp().defaultNow().notNull(),
  },
  (table) => [unique().on(table.organizationId, table.kind, table.period)],
);

export const userSessions = pgTable(
  "user_sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    kind: text().notNull(),
    ip: text(),
    userAgent: text(),
    deviceName: text(),
    createdAt: timestamp().defaultNow().notNull(),
    lastSeenAt: timestamp().defaultNow().notNull(),
    expiresAt: timestamp().notNull(),
    revokedAt: timestamp(),
  },
  (table) => [index("user_sessions_user_idx").on(table.userId, table.createdAt)],
);

export const twoFactorBackupCodes = pgTable(
  "two_factor_backup_codes",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    codeHash: text().notNull(),
    usedAt: timestamp(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [index("two_factor_backup_codes_user_idx").on(table.userId)],
);

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: uuid().primaryKey().defaultRandom(),
    reference: text().notNull().unique(),
    name: text().notNull(),
    email: text().notNull(),
    subject: text().notNull(),
    status: text().notNull().default("open"),
    source: text().notNull().default("contact_form"),
    userId: uuid().references(() => users.id),
    organizationId: uuid().references(() => organizations.id),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp().defaultNow().notNull(),
    resolvedAt: timestamp(),
  },
  (table) => [
    index("support_tickets_status_idx").on(table.status, table.updatedAt),
    index("support_tickets_user_idx").on(table.userId),
  ],
);

export const supportMessages = pgTable(
  "support_messages",
  {
    id: uuid().primaryKey().defaultRandom(),
    ticketId: uuid()
      .notNull()
      .references(() => supportTickets.id),
    kind: text().notNull(),
    body: text().notNull(),
    authorUserId: uuid().references(() => users.id),
    emailed: boolean().notNull().default(false),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [index("support_messages_ticket_idx").on(table.ticketId, table.createdAt)],
);

// Suppliers and customers: the people a business buys from and sells to.
// Archived (never deleted) so their credit history stays intact.
export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    name: text().notNull(),
    contactPerson: text(),
    phone: text(),
    email: text(),
    address: text(),
    notes: text(),
    // Days after a purchase reaches their account that it is due.
    paymentTermsDays: integer().notNull().default(30),
    // Authoritative, atomically updated running balance (what we owe them).
    // Not derived from summing credit_entries at read time, so a guarded
    // UPDATE on this column can never be raced the way a read-then-insert
    // check could be.
    balance: numeric({ mode: "number" }).notNull().default(0),
    status: text().notNull().default("active"),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp().defaultNow().notNull(),
  },
  (table) => [index("suppliers_organization_idx").on(table.organizationId)],
);

// The kinds of customer a business sells to (Retail, Wholesale, ...). Each
// organization keeps its own list; a type can suggest the credit limit for
// new customers of that type.
export const customerTypes = pgTable(
  "customer_types",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    name: text().notNull(),
    defaultCreditLimit: numeric({ mode: "number" }).notNull().default(0),
    defaultPaymentTermsDays: integer().notNull().default(30),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp().defaultNow().notNull(),
  },
  (table) => [unique().on(table.organizationId, table.name)],
);

export const customers = pgTable(
  "customers",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    name: text().notNull(),
    customerTypeId: uuid().references(() => customerTypes.id),
    phone: text(),
    email: text(),
    address: text(),
    notes: text(),
    creditLimit: numeric({ mode: "number" }).notNull().default(0),
    // Days after a sale that it is due.
    paymentTermsDays: integer().notNull().default(30),
    // Authoritative, atomically updated running balance (what they owe us).
    // Not derived from summing credit_entries at read time, so a guarded
    // UPDATE on this column can never be raced the way a read-then-insert
    // check could be.
    balance: numeric({ mode: "number" }).notNull().default(0),
    status: text().notNull().default("active"),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp().defaultNow().notNull(),
  },
  (table) => [index("customers_organization_idx").on(table.organizationId)],
);

// The credit ledger for both customers (what they owe us) and suppliers
// (what we owe them). `amount` is signed: positive raises the balance owed
// (a sale on credit, a supplier invoice), negative lowers it (a payment).
// A party's balance is always the sum of its entries, so two people
// recording payments at once, or offline and synced later, never overwrite
// each other. `clientRef` makes a retried request harmless: the same ref
// from the same organization returns the existing entry instead of adding
// a second one.
export const creditEntries = pgTable(
  "credit_entries",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    partyType: text().notNull(),
    partyId: uuid().notNull(),
    kind: text().notNull(),
    amount: numeric({ mode: "number" }).notNull(),
    note: text(),
    userId: uuid().references(() => users.id),
    clientRef: text(),
    purchaseId: uuid().references((): AnyPgColumn => purchases.id),
    saleId: uuid().references((): AnyPgColumn => sales.id),
    // For what raised the balance (a charge, or an adjustment up): how much
    // of it is still unpaid, and when it is due. Payments and credits settle
    // the oldest first, so the open amounts always add up to the balance.
    openAmount: numeric({ mode: "number" }).notNull().default(0),
    dueDate: timestamp(),
    // Payments: how it was paid, and for a customer paying on account, its
    // receipt number (RCPT-0001).
    method: text(),
    receiptNumber: text(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.organizationId, table.receiptNumber),
    index("credit_entries_open_idx").on(table.organizationId, table.partyType, table.openAmount),
    index("credit_entries_party_idx").on(
      table.organizationId,
      table.partyType,
      table.partyId,
      table.createdAt,
    ),
    unique().on(table.organizationId, table.clientRef),
  ],
);

export const paymentMethods = pgTable("payment_methods", {
  id: uuid().primaryKey().defaultRandom(),
  organizationId: uuid()
    .notNull()
    .unique()
    .references(() => organizations.id),
  authorizationCode: text().notNull(),
  email: text().notNull(),
  customerCode: text(),
  last4: text(),
  brand: text(),
  expMonth: text(),
  expYear: text(),
  bank: text(),
  updatedAt: timestamp().defaultNow().notNull(),
  createdAt: timestamp().defaultNow().notNull(),
});

export const paymentEvents = pgTable("payment_events", {
  id: uuid().primaryKey().defaultRandom(),
  eventKey: text().notNull().unique(),
  type: text().notNull(),
  reference: text(),
  createdAt: timestamp().defaultNow().notNull(),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    role: text().notNull(),
    permissions: text().array().notNull(),
    updatedBy: uuid().references(() => users.id),
    updatedAt: timestamp().defaultNow().notNull(),
  },
  (table) => [unique().on(table.organizationId, table.role)],
);

// Purchases from suppliers. Totals are stored when the purchase is saved;
// lines can only change while nothing has been received. Receiving,
// payments and cancelling run as database functions (migration 0022) so
// each is one all-or-nothing step.
export const purchases = pgTable(
  "purchases",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    number: integer().notNull(),
    reference: text().notNull(),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id),
    warehouseId: uuid()
      .notNull()
      .references(() => warehouses.id),
    status: text().notNull().default("draft"),
    orderDate: timestamp().notNull(),
    expectedDate: timestamp(),
    notes: text(),
    subtotal: numeric({ mode: "number" }).notNull().default(0),
    discount: numeric({ mode: "number" }).notNull().default(0),
    tax: numeric({ mode: "number" }).notNull().default(0),
    total: numeric({ mode: "number" }).notNull().default(0),
    amountPaid: numeric({ mode: "number" }).notNull().default(0),
    postedAt: timestamp(),
    receivedAt: timestamp(),
    cancelledAt: timestamp(),
    createdBy: uuid().references(() => users.id),
    clientRef: text(),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.organizationId, table.number),
    unique().on(table.organizationId, table.clientRef),
    index("purchases_organization_idx").on(table.organizationId, table.createdAt),
    index("purchases_supplier_idx").on(table.organizationId, table.supplierId),
  ],
);

export const purchaseLines = pgTable(
  "purchase_lines",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    purchaseId: uuid()
      .notNull()
      .references(() => purchases.id),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    position: integer().notNull().default(0),
    quantity: integer().notNull(),
    unitCost: numeric({ mode: "number" }).notNull(),
    receivedQuantity: integer().notNull().default(0),
  },
  (table) => [index("purchase_lines_purchase_idx").on(table.purchaseId)],
);

export const purchaseReceipts = pgTable(
  "purchase_receipts",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    purchaseId: uuid()
      .notNull()
      .references(() => purchases.id),
    userId: uuid().references(() => users.id),
    clientRef: text(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.organizationId, table.clientRef),
    index("purchase_receipts_purchase_idx").on(table.purchaseId),
  ],
);

export const purchasePayments = pgTable(
  "purchase_payments",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    purchaseId: uuid()
      .notNull()
      .references(() => purchases.id),
    amount: numeric({ mode: "number" }).notNull(),
    note: text(),
    userId: uuid().references(() => users.id),
    clientRef: text(),
    // Set when a payment on the supplier's account settled this purchase.
    creditEntryId: uuid().references((): AnyPgColumn => creditEntries.id),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.organizationId, table.clientRef),
    index("purchase_payments_purchase_idx").on(table.purchaseId),
  ],
);

// Sales to customers. A sale is completed when it is recorded (stock leaves
// the warehouse at once) and can only be voided afterwards. Creating,
// paying and voiding run as database functions (migration 0025) so each is
// one all-or-nothing step. customerId is null for a walk-in sale, which
// must be paid in full.
export const sales = pgTable(
  "sales",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    number: integer().notNull(),
    reference: text().notNull(),
    customerId: uuid().references(() => customers.id),
    warehouseId: uuid()
      .notNull()
      .references(() => warehouses.id),
    status: text().notNull().default("completed"),
    saleDate: timestamp().notNull(),
    // Sale date plus the customer's payment terms; null for walk-ins.
    dueDate: timestamp(),
    notes: text(),
    subtotal: numeric({ mode: "number" }).notNull().default(0),
    discount: numeric({ mode: "number" }).notNull().default(0),
    tax: numeric({ mode: "number" }).notNull().default(0),
    total: numeric({ mode: "number" }).notNull().default(0),
    amountPaid: numeric({ mode: "number" }).notNull().default(0),
    overLimitApprovedBy: uuid().references(() => users.id),
    voidedAt: timestamp(),
    voidedBy: uuid().references(() => users.id),
    voidReason: text(),
    createdBy: uuid().references(() => users.id),
    clientRef: text(),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.organizationId, table.number),
    unique().on(table.organizationId, table.clientRef),
    index("sales_organization_idx").on(table.organizationId, table.saleDate),
    index("sales_customer_idx").on(table.organizationId, table.customerId),
  ],
);

// unitCost is the product's purchase price when sold, kept for profit
// reports; listPrice is its selling price then, to show discounts given.
export const saleLines = pgTable(
  "sale_lines",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    saleId: uuid()
      .notNull()
      .references(() => sales.id),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    position: integer().notNull().default(0),
    quantity: integer().notNull(),
    unitPrice: numeric({ mode: "number" }).notNull(),
    listPrice: numeric({ mode: "number" }).notNull(),
    unitCost: numeric({ mode: "number" }).notNull().default(0),
  },
  (table) => [index("sale_lines_sale_idx").on(table.saleId)],
);

export const salePayments = pgTable(
  "sale_payments",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    saleId: uuid()
      .notNull()
      .references(() => sales.id),
    amount: numeric({ mode: "number" }).notNull(),
    method: text().notNull().default("cash"),
    note: text(),
    userId: uuid().references(() => users.id),
    clientRef: text(),
    // Set when a payment on the customer's account settled this sale.
    creditEntryId: uuid().references((): AnyPgColumn => creditEntries.id),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.organizationId, table.clientRef),
    index("sale_payments_sale_idx").on(table.saleId),
  ],
);

// Which debts each payment (or credit) settled: one row per debt it went
// to, oldest first. Receipts list them.
export const creditAllocations = pgTable(
  "credit_allocations",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    creditEntryId: uuid().references(() => creditEntries.id),
    debitEntryId: uuid()
      .notNull()
      .references(() => creditEntries.id),
    amount: numeric({ mode: "number" }).notNull(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    index("credit_allocations_credit_idx").on(table.creditEntryId),
    index("credit_allocations_debit_idx").on(table.debitEntryId),
  ],
);
