-- Migration 014: Offene Subscriptions-Policy entfernen
--
-- Die Policy "Service role can manage subscriptions" (for all using (true)) war nicht auf die Service-Role
-- beschränkt, sondern galt für ALLE Rollen: jeder eingeloggte Nutzer konnte alle Subscriptions lesen
-- (inkl. Stripe-IDs) sowie den eigenen oder fremden Plan ändern/löschen (z. B. auf "lifetime").
-- Die Service-Role umgeht RLS ohnehin – die Policy wird dafür nicht gebraucht.
-- Neue Free-Subscriptions legt der Trigger on_auth_user_created (Migration 013) an.

DROP POLICY IF EXISTS "Service role can manage subscriptions" ON public.subscriptions;

-- Bleibt bestehen: Nutzer dürfen nur ihre eigene Subscription lesen
--   "Users can read own subscription" ON subscriptions FOR SELECT USING (auth.uid() = user_id)
