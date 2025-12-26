-- Add requestCreatedMessageId field to requests table
ALTER TABLE requests 
ADD COLUMN IF NOT EXISTS request_created_message_id BIGINT;

