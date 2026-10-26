-- Every existing organization starts with the default customer types.
INSERT INTO "customer_types" ("organizationId", "name")
SELECT o."id", t."name"
FROM "organizations" o
CROSS JOIN (VALUES ('Retail'), ('Wholesale'), ('Distributor'), ('Corporate')) AS t("name")
ON CONFLICT DO NOTHING;
