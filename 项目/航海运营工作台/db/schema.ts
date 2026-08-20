import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const scysOpsSnapshots = sqliteTable("scys_ops_snapshots", {
  snapshotId: text("snapshot_id").primaryKey(),
  sourceMode: text("source_mode").notNull(),
  opsJson: text("ops_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});
