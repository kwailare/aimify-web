-- Every existing organization starts with the default expense categories.
INSERT INTO "expense_categories" ("organizationId", "name")
SELECT o."id", c."name"
FROM "organizations" o
CROSS JOIN (VALUES
  ('Rent'), ('Salaries & wages'), ('Transport & logistics'), ('Utilities'), ('Fuel & generator'),
  ('Repairs & maintenance'), ('Marketing'), ('Bank charges'), ('Taxes & levies'), ('Other')
) AS c("name")
ON CONFLICT DO NOTHING;
