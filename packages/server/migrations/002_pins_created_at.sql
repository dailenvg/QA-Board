-- pinpoint: lets expiry find old pins by creation time. Safe to run more than once.

CREATE INDEX IF NOT EXISTS pinpoint_pins_created_at_idx ON pinpoint_pins (created_at);
