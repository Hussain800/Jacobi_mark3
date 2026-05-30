-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  stripe_customer_id TEXT,
  subscription_tier TEXT DEFAULT 'free',
  probes_used_this_month INTEGER DEFAULT 0,
  probes_limit INTEGER DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create probes table
CREATE TABLE IF NOT EXISTS public.probes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  target_url TEXT NOT NULL,
  target_name TEXT,
  topology_class TEXT,
  baseline_price DECIMAL(10,2),
  max_price_spread DECIMAL(10,2),
  max_price_spread_pct DECIMAL(5,2),
  discrimination_index DECIMAL(10,2),
  control_stability DECIMAL(5,4),
  elapsed_seconds DECIMAL(8,2),
  total_agents INTEGER DEFAULT 24,
  successful_agents INTEGER DEFAULT 0,
  all_prices JSONB,
  gradients JSONB,
  agents JSONB,
  gemini_verdict TEXT,
  gemini_report JSONB,
  savings_verdict JSONB,
  raw_result JSONB,
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  tier TEXT DEFAULT 'free',
  status TEXT DEFAULT 'incomplete',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.probes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "subscriptions_select_own" ON public.subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_probes_created_at ON public.probes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
