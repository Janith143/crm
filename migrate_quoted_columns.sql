-- Migration: Add quoted message columns to messages table
-- Run on VPS: mysql -u crm_user -p clazz_crm < migrate_quoted_columns.sql

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS quoted_msg_id VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS quoted_msg_body TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS quoted_msg_sender VARCHAR(255) DEFAULT NULL;
