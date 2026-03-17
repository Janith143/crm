CREATE TABLE IF NOT EXISTS automation_rules (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    trigger_text VARCHAR(255) NOT NULL,
    response_text TEXT NOT NULL,
    steps JSON, -- Stores the array of steps for multi-step flow
    active BOOLEAN DEFAULT TRUE,
    match_type VARCHAR(50) DEFAULT 'contains',
    hit_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(255) PRIMARY KEY,
    chat_id VARCHAR(255) NOT NULL,
    sender_id VARCHAR(255),
    from_me BOOLEAN,
    body TEXT,
    timestamp BIGINT, -- Unix timestamp
    status VARCHAR(50), -- sent, delivered, read
    type VARCHAR(50),
    has_media BOOLEAN DEFAULT FALSE,
    ack INT DEFAULT 0,
    quoted_msg_id VARCHAR(255) DEFAULT NULL,
    quoted_msg_body TEXT DEFAULT NULL,
    quoted_msg_sender VARCHAR(255) DEFAULT NULL,
    INDEX idx_chat_id (chat_id),
    INDEX idx_timestamp (timestamp)
);

CREATE TABLE IF NOT EXISTS automation_sessions (
    user_id VARCHAR(255) PRIMARY KEY, -- Phone number
    workflow_id VARCHAR(255) NOT NULL,
    current_step_index VARCHAR(255) DEFAULT '0',
    last_interaction TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teacher_metadata (
    id VARCHAR(255) PRIMARY KEY, -- This will be the WhatsApp Chat ID (e.g., 123456789@c.us)
    name VARCHAR(255),
    source VARCHAR(50),
    status VARCHAR(50),
    tags JSON,
    notes TEXT,
    location VARCHAR(255),
    email VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pipeline_stages (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    position INT NOT NULL,
    color VARCHAR(20) DEFAULT 'bg-slate-400'
);

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'agent', -- 'admin' or 'agent'
    permissions JSON DEFAULT NULL, -- Array of allowed tabs e.g. ["inbox", "pipeline"]
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default stages if table is empty
INSERT IGNORE INTO pipeline_stages (id, name, position, color) VALUES 
('New Lead', 'New Lead', 1, 'bg-blue-500'),
('Responded', 'Responded', 2, 'bg-slate-400'),
('Verified', 'Verified', 3, 'bg-slate-400'),
('Registered', 'Registered', 4, 'bg-slate-400'),
('Uploaded Class', 'Uploaded Class', 5, 'bg-orange-400'),
('First Sale', 'First Sale', 6, 'bg-purple-500'),
('Active Teacher', 'Active Teacher', 7, 'bg-green-600');

CREATE TABLE IF NOT EXISTS app_settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
