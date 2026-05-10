ALTER TABLE "board_columns" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'custom';

UPDATE "board_columns"
SET "kind" = CASE
  WHEN lower(trim("name")) IN ('backlog', 'бэклог') THEN 'backlog'
  WHEN lower(trim("name")) IN ('todo', 'to do', 'к выполнению') THEN 'todo'
  WHEN lower(trim("name")) IN ('in progress', 'в работе') THEN 'in_progress'
  WHEN lower(trim("name")) IN ('review', 'на проверке') THEN 'review'
  WHEN lower(trim("name")) IN ('done', 'готово') THEN 'done'
  ELSE 'custom'
END;

WITH ranked_columns AS (
  SELECT
    "id",
    first_value("id") OVER (
      PARTITION BY "user_id", "workspace_id", "project_id", "kind"
      ORDER BY "position" ASC, "created_at" ASC, "id" ASC
    ) AS "primary_id",
    row_number() OVER (
      PARTITION BY "user_id", "workspace_id", "project_id", "kind"
      ORDER BY "position" ASC, "created_at" ASC, "id" ASC
    ) AS "rank"
  FROM "board_columns"
  WHERE "deleted_at" IS NULL
    AND "kind" IN ('backlog', 'todo', 'in_progress', 'review', 'done')
)
UPDATE "tasks"
SET
  "column_id" = ranked_columns."primary_id",
  "updated_at" = NOW()
FROM ranked_columns
WHERE "tasks"."column_id" = ranked_columns."id"
  AND ranked_columns."rank" > 1;

WITH ranked_columns AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "user_id", "workspace_id", "project_id", "kind"
      ORDER BY "position" ASC, "created_at" ASC, "id" ASC
    ) AS "rank"
  FROM "board_columns"
  WHERE "deleted_at" IS NULL
    AND "kind" IN ('backlog', 'todo', 'in_progress', 'review', 'done')
)
UPDATE "board_columns"
SET
  "deleted_at" = NOW(),
  "updated_at" = NOW()
FROM ranked_columns
WHERE "board_columns"."id" = ranked_columns."id"
  AND ranked_columns."rank" > 1;

WITH ordered_columns AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "project_id"
      ORDER BY
        CASE "kind"
          WHEN 'backlog' THEN 0
          WHEN 'todo' THEN 1
          WHEN 'in_progress' THEN 2
          WHEN 'review' THEN 3
          WHEN 'done' THEN 4
          ELSE 100
        END ASC,
        "position" ASC,
        "created_at" ASC,
        "id" ASC
    ) - 1 AS "next_position"
  FROM "board_columns"
  WHERE "deleted_at" IS NULL
)
UPDATE "board_columns"
SET
  "position" = ordered_columns."next_position",
  "updated_at" = NOW()
FROM ordered_columns
WHERE "board_columns"."id" = ordered_columns."id";

CREATE INDEX "board_columns_user_id_workspace_id_project_id_kind_idx" ON "board_columns"("user_id", "workspace_id", "project_id", "kind");
