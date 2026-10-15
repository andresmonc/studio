-- Dev seed data, loaded after migrations by bootstrap.sh. Idempotent (truncate+insert).
-- replica mode skips foreign-key triggers, so rows load in any order (flags point
-- at versions inserted later); it needs a superuser, as in the compose setup.
BEGIN;
SET session_replication_role = replica;
TRUNCATE public.audit_log, public.flagset_api_keys, public.flag_tags, public.flag_versions, public.flags,
  public.flagsets, public.team_members, public.teams, public.users, public.companies RESTART IDENTITY CASCADE;
--
-- PostgreSQL database dump
--


-- Dumped from database version 16.14 (Debian 16.14-1.pgdg13+1)
-- Dumped by pg_dump version 16.14 (Debian 16.14-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: companies; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.companies (id, display_name, description, created_at, updated_at) VALUES ('3b49fdbf-e7f6-4797-883a-f8a02fc3e8b5', 'TNEC', '', '2026-05-31 12:52:31.342758+00', '2026-05-31 12:52:31.342758+00');


--
-- Data for Name: teams; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.teams (id, name, description, created_at, updated_at, company_id) VALUES ('eb5e5ec9-11f8-4b61-8399-565471e915d0', 'Default Team', '', '2026-05-31 12:56:04.521051+00', '2026-05-31 12:56:04.521051+00', '3b49fdbf-e7f6-4797-883a-f8a02fc3e8b5');
INSERT INTO public.teams (id, name, description, created_at, updated_at, company_id) VALUES ('dde6726f-2d95-48d6-90c9-9ddaab99fa2a', 'This is a test', '', '2026-06-03 15:29:40.711882+00', '2026-06-03 15:29:40.711882+00', '3b49fdbf-e7f6-4797-883a-f8a02fc3e8b5');


--
-- Data for Name: flagsets; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.flagsets (id, team_id, name, description, polling_interval_ms, file_format, retrievers, exporters, notifiers, created_at, updated_at, evaluation_context_enrichment) VALUES ('f69a0db8-8b25-4e09-ac4e-0b35b7a11235', 'eb5e5ec9-11f8-4b61-8399-565471e915d0', 'mobile-preprod', 'This is a mobile preprod', NULL, NULL, NULL, NULL, NULL, '2026-06-03 17:48:16.734915+00', '2026-06-04 14:54:41.948256+00', '{"hey": "you"}');
INSERT INTO public.flagsets (id, team_id, name, description, polling_interval_ms, file_format, retrievers, exporters, notifiers, created_at, updated_at, evaluation_context_enrichment) VALUES ('74e777ee-91e2-40b4-bd92-50fc7a58964d', 'dde6726f-2d95-48d6-90c9-9ddaab99fa2a', 'mobile-prod', 'flrkhcebsakdlb', NULL, NULL, NULL, NULL, NULL, '2026-06-03 17:55:22.556842+00', '2026-06-04 14:59:20.618965+00', NULL);
INSERT INTO public.flagsets (id, team_id, name, description, polling_interval_ms, file_format, retrievers, exporters, notifiers, created_at, updated_at, evaluation_context_enrichment) VALUES ('2b1375ac-82f4-435a-81ed-fe6b7fd74f9e', 'dde6726f-2d95-48d6-90c9-9ddaab99fa2a', 'member-team', '', NULL, NULL, NULL, NULL, NULL, '2026-06-15 16:18:55.474031+00', '2026-06-15 16:18:55.474031+00', '{"team": "member"}');


--
-- Data for Name: flags; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.flags (id, flagset_id, name, current_version_id, disabled, deleted_at, created_at, updated_at) VALUES ('f9498872-2bcf-4c3b-832a-fe1c1bc40408', '74e777ee-91e2-40b4-bd92-50fc7a58964d', 'vfrdgsc', '891d0084-e37b-4ddf-9fd3-132487f6a554', false, NULL, '2026-06-15 16:13:14.604092+00', '2026-06-15 16:14:08.440877+00');
INSERT INTO public.flags (id, flagset_id, name, current_version_id, disabled, deleted_at, created_at, updated_at) VALUES ('94aeab22-4ad9-4d7b-bbe7-e1aea7877f9a', '74e777ee-91e2-40b4-bd92-50fc7a58964d', 'ksdh', '0fe3d515-2668-42af-b0e1-cfbdb2a8f463', false, NULL, '2026-06-16 16:35:10.476143+00', '2026-06-16 16:35:10.476143+00');
INSERT INTO public.flags (id, flagset_id, name, current_version_id, disabled, deleted_at, created_at, updated_at) VALUES ('38885e20-5326-4e24-ad15-ac3e1957cabc', '74e777ee-91e2-40b4-bd92-50fc7a58964d', 'bgrfvsd', '3d92bb8e-76df-4988-a221-57b48777c93e', false, NULL, '2026-06-15 15:57:23.249597+00', '2026-06-16 16:36:42.348709+00');
INSERT INTO public.flags (id, flagset_id, name, current_version_id, disabled, deleted_at, created_at, updated_at) VALUES ('aaafe872-5258-4145-8b51-aab9b8025754', '2b1375ac-82f4-435a-81ed-fe6b7fd74f9e', 'new-ff', 'eaec917b-6be3-41a3-a3b6-4a9c0ff0da08', false, NULL, '2026-06-17 07:32:48.718938+00', '2026-06-17 07:32:48.718938+00');
INSERT INTO public.flags (id, flagset_id, name, current_version_id, disabled, deleted_at, created_at, updated_at) VALUES ('ba0c7b17-16aa-4302-9e27-91ac0bf3b587', 'f69a0db8-8b25-4e09-ac4e-0b35b7a11235', 'dsdsqa', '7a51a47c-ee45-4169-b644-5ccfec9bd4f1', false, NULL, '2026-06-17 07:53:10.754128+00', '2026-06-17 07:53:10.754128+00');
INSERT INTO public.flags (id, flagset_id, name, current_version_id, disabled, deleted_at, created_at, updated_at) VALUES ('cf1d42d4-23c9-4420-8004-2fb20e61d4d3', 'f69a0db8-8b25-4e09-ac4e-0b35b7a11235', 'hello-there', 'a69b3eb8-701a-4bb2-904f-1c324cd661b2', false, NULL, '2026-06-17 07:08:58.776035+00', '2026-06-17 08:34:32.849575+00');


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.users (id, email, name, oidc_sub, is_super_admin, created_at, updated_at, last_login_at, company_id, company_role, avatar_url) VALUES ('86b757de-b0f6-4eee-b603-49ac46bc06e0', 'admin@local.io', 'Admin Local', NULL, true, '2026-05-31 12:55:07.453042+00', '2026-06-04 09:38:47.147775+00', '2026-06-04 09:38:47.147775+00', NULL, NULL, '');
INSERT INTO public.users (id, email, name, oidc_sub, is_super_admin, created_at, updated_at, last_login_at, company_id, company_role, avatar_url) VALUES ('1cf36f98-0db0-438e-a7df-18e90881ebd7', 'user2@local.io', 'User Local', NULL, false, '2026-05-31 12:59:18.201865+00', '2026-06-04 12:30:39.415251+00', '2026-06-04 12:30:39.415251+00', '3b49fdbf-e7f6-4797-883a-f8a02fc3e8b5', 'member', '');
INSERT INTO public.users (id, email, name, oidc_sub, is_super_admin, created_at, updated_at, last_login_at, company_id, company_role, avatar_url) VALUES ('f9df3b05-1fb2-4ebe-8470-2c2b1846371c', 'user@local.io', 'User Local', NULL, false, '2026-05-31 12:52:26.49974+00', '2026-06-04 14:53:31.856458+00', '2026-06-04 14:53:31.856458+00', '3b49fdbf-e7f6-4797-883a-f8a02fc3e8b5', 'admin', '');
INSERT INTO public.users (id, email, name, oidc_sub, is_super_admin, created_at, updated_at, last_login_at, company_id, company_role, avatar_url) VALUES ('a199c569-14e2-4173-80f2-26bc2e9a5ef1', 'user1@local.io', 'User Local', NULL, false, '2026-05-31 12:57:48.34774+00', '2026-06-16 16:36:26.641175+00', '2026-06-16 16:36:26.641175+00', '3b49fdbf-e7f6-4797-883a-f8a02fc3e8b5', 'member', '');


--
-- Data for Name: flag_versions; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.flag_versions (id, flag_id, version_number, payload, comment, created_by, created_at) VALUES ('64bb80c7-7f9b-473b-9d44-f13cdd302eb3', '38885e20-5326-4e24-ad15-ac3e1957cabc', 1, '{"variations":{"variationA":"q","variationB":"a"},"metadata":{"description":"ftgrdss","flagType":"string"},"defaultRule":{"progressiveRollout":{"initial":{"variation":"variationB","percentage":0,"date":"2025-12-31T23:00:00.000Z"},"end":{"variation":"variationA","percentage":100,"date":"2026-12-31T23:00:00.000Z"}}},"trackEvents":true}', '', 'a199c569-14e2-4173-80f2-26bc2e9a5ef1', '2026-06-15 15:57:23.249597+00');
INSERT INTO public.flag_versions (id, flag_id, version_number, payload, comment, created_by, created_at) VALUES ('d9c2aa75-8177-4a12-b092-e62b44fe6bc3', '38885e20-5326-4e24-ad15-ac3e1957cabc', 2, '{"variations":{"variationA":"q","variationB":"a"},"metadata":{"description":"ftgrdss","flagType":"string"},"defaultRule":{"progressiveRollout":{"initial":{"variation":"variationB","percentage":71,"date":"2025-12-31T23:00:00.000Z"},"end":{"variation":"variationA","percentage":81,"date":"2026-12-31T23:00:00.000Z"}}},"trackEvents":true}', '', 'a199c569-14e2-4173-80f2-26bc2e9a5ef1', '2026-06-15 15:58:12.516708+00');
INSERT INTO public.flag_versions (id, flag_id, version_number, payload, comment, created_by, created_at) VALUES ('21a79d45-3fd3-4dd0-b59f-e36b4322f19a', 'f9498872-2bcf-4c3b-832a-fe1c1bc40408', 1, '{"variations":{"variationA":1,"variationB":2,"variation3":3},"metadata":{"description":"fgvsd","flagType":"integer"},"defaultRule":{"variation":"variationB"},"trackEvents":true}', '', 'a199c569-14e2-4173-80f2-26bc2e9a5ef1', '2026-06-15 16:13:14.604092+00');
INSERT INTO public.flag_versions (id, flag_id, version_number, payload, comment, created_by, created_at) VALUES ('891d0084-e37b-4ddf-9fd3-132487f6a554', 'f9498872-2bcf-4c3b-832a-fe1c1bc40408', 2, '{"variations":{"variationA":1,"variationB":2,"variation3":3},"metadata":{"description":"fgvsd","flagType":"integer"},"defaultRule":{"percentage":{"variationA":30.2,"variationB":67,"variation3":2.8}},"trackEvents":true}', '', 'a199c569-14e2-4173-80f2-26bc2e9a5ef1', '2026-06-15 16:14:08.440877+00');
INSERT INTO public.flag_versions (id, flag_id, version_number, payload, comment, created_by, created_at) VALUES ('17c8fd80-5a98-4430-aa82-113821dc36bd', '38885e20-5326-4e24-ad15-ac3e1957cabc', 3, '{"variations":{"variationA":"q","variationB":"a"},"metadata":{"description":"ftgrdss","flagType":"string"},"defaultRule":{"progressiveRollout":{"initial":{"variation":"variationB","percentage":15,"date":"2025-12-31T23:00:00.000Z"},"end":{"variation":"variationA","percentage":81,"date":"2026-12-31T23:00:00.000Z"}}},"trackEvents":true}', '', 'a199c569-14e2-4173-80f2-26bc2e9a5ef1', '2026-06-16 07:39:06.488699+00');
INSERT INTO public.flag_versions (id, flag_id, version_number, payload, comment, created_by, created_at) VALUES ('a4398372-85b6-4325-9a8e-bbd00d916036', '38885e20-5326-4e24-ad15-ac3e1957cabc', 4, '{"variations":{"variationA":"q","variationB":"a"},"metadata":{"description":"ftgrdss","flagType":"string"},"defaultRule":{"progressiveRollout":{"initial":{"variation":"variationB","percentage":26,"date":"2025-12-31T23:00:00.000Z"},"end":{"variation":"variationA","percentage":81,"date":"2026-12-31T23:00:00.000Z"}}},"trackEvents":true}', '', 'a199c569-14e2-4173-80f2-26bc2e9a5ef1', '2026-06-16 07:40:12.492913+00');
INSERT INTO public.flag_versions (id, flag_id, version_number, payload, comment, created_by, created_at) VALUES ('b4c17640-fb9c-4f9a-98b6-ca785c3698af', '38885e20-5326-4e24-ad15-ac3e1957cabc', 5, '{"variations":{"variationA":"q","variationB":"a"},"metadata":{"description":"ftgrdss","flagType":"string"},"defaultRule":{"progressiveRollout":{"initial":{"variation":"variationB","percentage":15,"date":"2025-12-31T23:00:00.000Z"},"end":{"variation":"variationA","percentage":81,"date":"2026-12-31T23:00:00.000Z"}}},"trackEvents":true}', 'rollback to version 3', 'a199c569-14e2-4173-80f2-26bc2e9a5ef1', '2026-06-16 08:40:01.662079+00');
INSERT INTO public.flag_versions (id, flag_id, version_number, payload, comment, created_by, created_at) VALUES ('0fe3d515-2668-42af-b0e1-cfbdb2a8f463', '94aeab22-4ad9-4d7b-bbe7-e1aea7877f9a', 1, '{"variations":{"enabled":true,"disabled":false},"metadata":{"description":"BNGFD","flagType":"boolean"},"defaultRule":{"variation":"enabled"},"trackEvents":true}', '', 'a199c569-14e2-4173-80f2-26bc2e9a5ef1', '2026-06-16 16:35:10.476143+00');
INSERT INTO public.flag_versions (id, flag_id, version_number, payload, comment, created_by, created_at) VALUES ('e5880cba-d952-4b24-8eb8-b66750f20224', '38885e20-5326-4e24-ad15-ac3e1957cabc', 6, '{"variations":{"variationA":"q","variationB":"a"},"metadata":{"description":"ftgrdss","flagType":"string"},"defaultRule":{"percentage":{"variationA":49,"variationB":51}},"trackEvents":true}', '', 'a199c569-14e2-4173-80f2-26bc2e9a5ef1', '2026-06-16 16:35:29.402595+00');
INSERT INTO public.flag_versions (id, flag_id, version_number, payload, comment, created_by, created_at) VALUES ('3d92bb8e-76df-4988-a221-57b48777c93e', '38885e20-5326-4e24-ad15-ac3e1957cabc', 7, '{"variations":{"variationA":"q","variationB":"a"},"metadata":{"description":"ftgrdss","flagType":"string"},"targeting":[{"name":"Rule 1","query":"{\"and\":[{\"==\":[{\"var\":\"MYCUSTON\"},\"VDCSA\"]}]}","variation":"variationA"}],"defaultRule":{"percentage":{"variationA":49,"variationB":51}},"trackEvents":true}', '', 'a199c569-14e2-4173-80f2-26bc2e9a5ef1', '2026-06-16 16:35:52.813583+00');
INSERT INTO public.flag_versions (id, flag_id, version_number, payload, comment, created_by, created_at) VALUES ('489c18c5-acdb-45da-930f-3246f3aa6844', 'cf1d42d4-23c9-4420-8004-2fb20e61d4d3', 1, '{"variations":{"enabled":true,"disabled":false},"defaultRule":{"variation":"enabled"},"trackEvents":true,"metadata":{"flagType":"boolean"}}', 'feat(flags): hello 👋', 'a199c569-14e2-4173-80f2-26bc2e9a5ef1', '2026-06-17 07:08:58.776035+00');
INSERT INTO public.flag_versions (id, flag_id, version_number, payload, comment, created_by, created_at) VALUES ('eaec917b-6be3-41a3-a3b6-4a9c0ff0da08', 'aaafe872-5258-4145-8b51-aab9b8025754', 1, '{"variations":{"enabled":true,"disabled":false},"metadata":{"description":"This is a test","flagType":"boolean"},"defaultRule":{"variation":"enabled"},"trackEvents":true}', '', 'a199c569-14e2-4173-80f2-26bc2e9a5ef1', '2026-06-17 07:32:48.718938+00');
INSERT INTO public.flag_versions (id, flag_id, version_number, payload, comment, created_by, created_at) VALUES ('bd92475f-3e39-4821-b4a6-e9b640aba196', 'cf1d42d4-23c9-4420-8004-2fb20e61d4d3', 2, '{"variations":{"enabled":true,"disabled":false},"defaultRule":{"percentage":{"enabled":40,"disabled":60}},"trackEvents":true,"metadata":{"flagType":"boolean"}}', '', 'a199c569-14e2-4173-80f2-26bc2e9a5ef1', '2026-06-17 07:52:46.342851+00');
INSERT INTO public.flag_versions (id, flag_id, version_number, payload, comment, created_by, created_at) VALUES ('7a51a47c-ee45-4169-b644-5ccfec9bd4f1', 'ba0c7b17-16aa-4302-9e27-91ac0bf3b587', 1, '{"variations":{"variationA":"d","variationB":"d","variation3":"d"},"defaultRule":{"percentage":{"variationA":33,"variationB":36,"variation3":31}},"trackEvents":true,"metadata":{"flagType":"string"}}', '', 'a199c569-14e2-4173-80f2-26bc2e9a5ef1', '2026-06-17 07:53:10.754128+00');
INSERT INTO public.flag_versions (id, flag_id, version_number, payload, comment, created_by, created_at) VALUES ('54fe61ed-2751-48a1-a08a-9af7c872e090', 'cf1d42d4-23c9-4420-8004-2fb20e61d4d3', 3, '{"variations":{"enabled":true,"disabled":false},"defaultRule":{"percentage":{"enabled":53,"disabled":47}},"trackEvents":true,"metadata":{"flagType":"boolean"}}', '', 'a199c569-14e2-4173-80f2-26bc2e9a5ef1', '2026-06-17 08:30:59.082+00');
INSERT INTO public.flag_versions (id, flag_id, version_number, payload, comment, created_by, created_at) VALUES ('a69b3eb8-701a-4bb2-904f-1c324cd661b2', 'cf1d42d4-23c9-4420-8004-2fb20e61d4d3', 4, '{"variations":{"enabled":true,"disabled":false},"defaultRule":{"percentage":{"enabled":48.49000000000001,"disabled":51.51}},"trackEvents":true,"metadata":{"flagType":"boolean"}}', '', 'a199c569-14e2-4173-80f2-26bc2e9a5ef1', '2026-06-17 08:34:32.849575+00');


--
-- Data for Name: flagset_api_keys; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.flagset_api_keys (id, flagset_id, label, api_key, created_by, created_at) VALUES ('00260d4f-0cec-431f-8c9c-488a16c3811b', '74e777ee-91e2-40b4-bd92-50fc7a58964d', 'Android App', 'goff_822ebbbf4c50c465c20bb20a1363d2f75a25722fa8ec4153b4b04282f5bcd5b1', 'f9df3b05-1fb2-4ebe-8470-2c2b1846371c', '2026-06-04 14:58:45.420324+00');
INSERT INTO public.flagset_api_keys (id, flagset_id, label, api_key, created_by, created_at) VALUES ('7e816c72-333e-4308-b276-295481c487e9', '74e777ee-91e2-40b4-bd92-50fc7a58964d', 'iOS App', 'goff_e237cc3ada555732c22271d424cbdc61a4452f1bd1c91a478a9119c0e5be42f2', 'f9df3b05-1fb2-4ebe-8470-2c2b1846371c', '2026-06-04 14:59:03.847133+00');


--
-- Data for Name: team_members; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.team_members (team_id, user_id, role, created_at) VALUES ('dde6726f-2d95-48d6-90c9-9ddaab99fa2a', 'f9df3b05-1fb2-4ebe-8470-2c2b1846371c', 'admin', '2026-06-03 15:29:40.719915+00');
INSERT INTO public.team_members (team_id, user_id, role, created_at) VALUES ('dde6726f-2d95-48d6-90c9-9ddaab99fa2a', 'a199c569-14e2-4173-80f2-26bc2e9a5ef1', 'editor', '2026-06-03 15:31:20.18051+00');
INSERT INTO public.team_members (team_id, user_id, role, created_at) VALUES ('eb5e5ec9-11f8-4b61-8399-565471e915d0', '1cf36f98-0db0-438e-a7df-18e90881ebd7', 'viewer', '2026-05-31 13:01:07.855461+00');
INSERT INTO public.team_members (team_id, user_id, role, created_at) VALUES ('eb5e5ec9-11f8-4b61-8399-565471e915d0', 'a199c569-14e2-4173-80f2-26bc2e9a5ef1', 'editor', '2026-05-31 13:01:01.892394+00');


--
-- PostgreSQL database dump complete
--


SET session_replication_role = origin;
COMMIT;
