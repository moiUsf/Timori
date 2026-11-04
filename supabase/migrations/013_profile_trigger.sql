-- Migration 013: Profil-Anlage per Trigger + Schutz der Freigabe-Felder
--
-- Hintergrund: Bei aktiver E-Mail-Bestätigung liefert signUp() keine Session.
-- Das Profil-INSERT aus dem Browser lief daher anonym (auth.uid() = null) und wurde von RLS blockiert.
-- Lösung: Profil (+ Free-Subscription) wird direkt in der DB beim Anlegen des auth-Users erzeugt.

-- 1) Markierung, ob die Admin-Freigabe-Mail bereits verschickt wurde (verhindert Doppel-/Spam-Mails)
ALTER TABLE public.users_profile
  ADD COLUMN IF NOT EXISTS admin_notified_at timestamptz;

-- 2) Trigger-Funktion: legt Profil + Free-Subscription für jeden neuen auth-User an
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    INSERT INTO public.users_profile (user_id, name)
    VALUES (
      NEW.id,
      COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data ->> 'name'), ''), SPLIT_PART(NEW.email, '@', 1), 'Benutzer')
    )
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.subscriptions (user_id, plan, status)
    VALUES (NEW.id, 'free', 'active')
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Registrierung niemals blockieren; die App legt das Profil serverseitig als Fallback an
    RAISE WARNING 'handle_new_user: Profil für % konnte nicht angelegt werden: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3) Sicherheit: Nutzer dürfen sich nicht selbst freischalten.
--    Die Policy "Users can manage own profile" erlaubt sonst UPDATE von approved/approval_status per REST-API.
--    Für Requests mit Nutzer-JWT (anon/authenticated) werden diese Felder erzwungen bzw. unverändert gelassen.
--    Service-Role (Admin-Routen) und interne Rollen (Trigger, SQL Editor) sind nicht betroffen.
CREATE OR REPLACE FUNCTION public.protect_approval_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  jwt_role text := COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
BEGIN
  IF jwt_role IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.approved := false;
      NEW.approval_status := 'pending';
      NEW.approval_token := gen_random_uuid();
      NEW.admin_notified_at := NULL;
    ELSE
      NEW.approved := OLD.approved;
      NEW.approval_status := OLD.approval_status;
      NEW.approval_token := OLD.approval_token;
      NEW.admin_notified_at := OLD.admin_notified_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_profile_protect_approval ON public.users_profile;
CREATE TRIGGER users_profile_protect_approval
  BEFORE INSERT OR UPDATE ON public.users_profile
  FOR EACH ROW EXECUTE FUNCTION public.protect_approval_fields();
