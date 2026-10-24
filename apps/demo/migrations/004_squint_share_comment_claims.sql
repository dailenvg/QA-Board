-- Each pending client comment records the claim (a random nonce) that inserted it, and the
-- key its crop is stored under (crop:<id>:<claim>). Confirming, and cleaning up after a failed
-- upload, only ever touch the row and blob of their own claim. Safe to run more than once.

ALTER TABLE squint_share_comments ADD COLUMN IF NOT EXISTS claim text;
ALTER TABLE squint_share_comments ADD COLUMN IF NOT EXISTS crop_key text;
