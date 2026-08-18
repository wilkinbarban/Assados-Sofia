-- RLS still limits rows to active operators through the existing policy.
GRANT SELECT ON TABLE public.base_conhecimento TO authenticated;
