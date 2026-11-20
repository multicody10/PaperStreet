-- Store verified Discord avatar metadata. Legacy users receive a Discord default avatar
-- until their next OAuth sign-in refreshes the profile; never alter their cash or trades.
ALTER TABLE players ADD COLUMN avatar_hash TEXT;
ALTER TABLE players ADD COLUMN avatar_discriminator TEXT;
