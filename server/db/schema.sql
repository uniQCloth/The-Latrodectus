-- Widow Spider Multiplier — PostgreSQL Schema
-- Run: psql -U postgres -d widow_spider -f schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Players ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS players (
  id            SERIAL PRIMARY KEY,
  uuid          UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
  email         VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  username      VARCHAR(50) UNIQUE NOT NULL DEFAULT 'Spider',
  balance       DECIMAL(12,2) NOT NULL DEFAULT 1000.00,
  total_wagered DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_won     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  rounds_played INTEGER NOT NULL DEFAULT 0,
  age_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_seen     TIMESTAMPTZ DEFAULT NOW()
);

-- Migrations for existing databases (safe to run repeatedly)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='players' AND column_name='email') THEN
    ALTER TABLE players ADD COLUMN email VARCHAR(255) UNIQUE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='players' AND column_name='password_hash') THEN
    ALTER TABLE players ADD COLUMN password_hash VARCHAR(255);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='players' AND column_name='is_admin') THEN
    ALTER TABLE players ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
  -- Signup bonus play-through tracker: amount of bonus still locked (0 = fully unlocked)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='players' AND column_name='bonus_pending') THEN
    ALTER TABLE players ADD COLUMN bonus_pending DECIMAL(12,2) NOT NULL DEFAULT 0.00;
  END IF;
END $$;

-- ── Rounds ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rounds (
  id           SERIAL PRIMARY KEY,
  round_id     INTEGER UNIQUE NOT NULL,
  secret_seed  VARCHAR(64) NOT NULL,
  public_hash  VARCHAR(64) NOT NULL,
  crash_point  DECIMAL(10,2) NOT NULL,
  bet_count    INTEGER NOT NULL DEFAULT 0,
  total_wagered DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_paid   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  started_at   TIMESTAMPTZ,
  ended_at     TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Bets ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bets (
  id           SERIAL PRIMARY KEY,
  round_id     INTEGER NOT NULL REFERENCES rounds(round_id) ON DELETE CASCADE,
  player_id    INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  amount       DECIMAL(10,2) NOT NULL,
  auto_cashout DECIMAL(10,2),          -- null = no auto
  cashed_out   BOOLEAN NOT NULL DEFAULT FALSE,
  cashout_at   DECIMAL(10,2),          -- multiplier at cashout
  payout       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bets_round    ON bets(round_id);
CREATE INDEX IF NOT EXISTS idx_bets_player   ON bets(player_id);
CREATE INDEX IF NOT EXISTS idx_rounds_id     ON rounds(round_id);
CREATE INDEX IF NOT EXISTS idx_players_uuid  ON players(uuid);

-- ── Transactions (deposits + withdrawals) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id                  SERIAL PRIMARY KEY,
  player_id           INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  type                VARCHAR(12) NOT NULL CHECK (type IN ('deposit','withdrawal')),
  amount              DECIMAL(12,6) NOT NULL,
  txid                VARCHAR(100),
  destination_address VARCHAR(60),
  status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','pending_review','confirmed','failed')),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at        TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_txid
  ON transactions(txid) WHERE txid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_player
  ON transactions(player_id);

-- ── Leaderboard view ─────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW leaderboard AS
  SELECT
    p.username,
    p.total_won,
    p.total_wagered,
    p.rounds_played,
    ROUND(p.total_won - p.total_wagered, 2) AS net_profit
  FROM players p
  WHERE p.rounds_played > 0
  ORDER BY net_profit DESC
  LIMIT 50;
