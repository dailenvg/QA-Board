-- `password_resets` goes (Milestone 4a, PR 5). Reset links have lived in `verifications` since
-- 049 (PR 2), which copied the open ones across; nothing has read or written this table since.
-- A link lasts one hour, so every row left in it has expired. Its index and its `by_admin` column
-- (046) go with it. The audit log's "password_resets" field name stays: it names reset links.
--
-- No CASCADE: nothing depends on the table, and if something did, the drop should fail rather
-- than take it along. 049 reads this table, so it can't run again after this one; the runner
-- never re-runs an applied migration. Safe to run more than once.

DROP TABLE IF EXISTS password_resets;
