-- Persist the companion's last transport route and failure category so an
-- offline device retains useful evidence from its final heartbeat.
ALTER TABLE "CompanionDevice" ADD COLUMN "networkDiagnostic" JSONB;
ALTER TABLE "CompanionHeartbeat" ADD COLUMN "networkDiagnostic" JSONB;
