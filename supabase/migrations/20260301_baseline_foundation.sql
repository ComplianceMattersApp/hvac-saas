





CREATE SCHEMA IF NOT EXISTS "public";


create extension if not exists pg_trgm with schema public;




CREATE OR REPLACE FUNCTION "public"."handle_contractor_invite_accept"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  -- Intentionally empty.
  -- Contractor membership is written by the app-level acceptance bridge
  -- (ensureContractorMembershipFromInvite) in /set-password, not by a
  -- DB trigger. The trigger that previously called this function has been
  -- dropped above. This no-op body remains so the function object is
  -- present and harmless if queried.
  return new;
end;
$$;






CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;









CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;





CREATE TABLE IF NOT EXISTS "public"."attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "bucket" "text" DEFAULT 'attachments'::"text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "file_name" "text",
    "content_type" "text",
    "file_size" bigint,
    "caption" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."calendar_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "start_at" timestamp with time zone NOT NULL,
    "end_at" timestamp with time zone,
    "job_id" "uuid",
    "service_id" "uuid",
    "status" "text" DEFAULT 'scheduled'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."contractor_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "contractor_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "sent_count" integer DEFAULT 0 NOT NULL,
    "last_sent_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "auth_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contractor_invites_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'revoked'::"text", 'expired'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."contractor_users" (
    "contractor_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."contractors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "phone" "text",
    "email" "text",
    "notes" "text",
    "billing_name" "text",
    "billing_email" "text",
    "billing_phone" "text",
    "billing_address_line1" "text",
    "billing_address_line2" "text",
    "billing_city" "text",
    "billing_state" "text",
    "billing_zip" "text",
    "owner_user_id" "uuid"
);


CREATE TABLE IF NOT EXISTS "public"."equipment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "location_id" "uuid" NOT NULL,
    "equipment_type" "text",
    "manufacturer" "text",
    "model" "text",
    "serial" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "owner_user_id" "uuid" DEFAULT "auth"."uid"()
);




CREATE TABLE IF NOT EXISTS "public"."jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scheduled_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title" "text" NOT NULL,
    "city" "text",
    "status" "text" DEFAULT 'open'::"text",
    "contractor_id" "uuid",
    "permit_number" "text",
    "window_start" time without time zone,
    "window_end" time without time zone,
    "customer_phone" "text",
    "on_the_way_at" timestamp with time zone,
    "customer_first_name" "text",
    "customer_last_name" "text",
    "customer_email" "text",
    "job_notes" "text",
    "job_type" "text" DEFAULT 'ecc'::"text" NOT NULL,
    "project_type" "text" DEFAULT 'alteration'::"text" NOT NULL,
    "job_address" "text",
    "customer_id" "uuid",
    "location_id" "uuid",
    "ops_status" "text" DEFAULT 'need_to_schedule'::"text" NOT NULL,
    "pending_info_reason" "text",
    "follow_up_date" "date",
    "next_action_note" "text",
    "action_required_by" "text",
    "lifecycle_state" "text" DEFAULT 'active'::"text" NOT NULL,
    "parent_job_id" "uuid",
    "invoice_number" "text",
    "data_entry_completed_at" timestamp with time zone,
    "closeout_status" "text",
    "billing_recipient" "text",
    "billing_name" "text",
    "billing_address_line1" "text",
    "billing_address_line2" "text",
    "billing_city" "text",
    "billing_state" "text",
    "billing_zip" "text",
    "billing_email" "text",
    "billing_phone" "text",
    "deleted_at" timestamp with time zone,
    "field_complete" boolean DEFAULT false NOT NULL,
    "certs_complete" boolean DEFAULT false NOT NULL,
    "invoice_complete" boolean DEFAULT false NOT NULL,
    "service_case_id" "uuid",
    "field_complete_at" timestamp with time zone,
    "jurisdiction" "text",
    "permit_date" "date",
    CONSTRAINT "jobs_billing_recipient_check" CHECK (("billing_recipient" = ANY (ARRAY['contractor'::"text", 'customer'::"text", 'other'::"text"]))),
    CONSTRAINT "jobs_closeout_status_check" CHECK ((("closeout_status" IS NULL) OR ("closeout_status" = ANY (ARRAY['paperwork_required'::"text", 'invoice_required'::"text", 'closed_out'::"text"])))),
    CONSTRAINT "jobs_parent_not_self" CHECK ((("parent_job_id" IS NULL) OR ("parent_job_id" <> "id"))),
    CONSTRAINT "jobs_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'on_the_way'::"text", 'in_process'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "jobs_title_not_blank" CHECK (("btrim"("title") <> ''::"text"))
);




CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "label" "text",
    "address_line1" "text",
    "address_line2" "text",
    "city" "text",
    "state" "text",
    "postal_code" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "nickname" "text",
    "zip" "text",
    "owner_user_id" "uuid" DEFAULT "auth"."uid"()
);



CREATE OR REPLACE VIEW "public"."customer_locations_summary" AS
 SELECT "l"."customer_id",
    "l"."id" AS "location_id",
    "l"."nickname",
    "l"."address_line1",
    "l"."address_line2",
    "l"."city",
    "l"."state",
    "l"."zip",
    "count"(DISTINCT "e"."id") AS "equipment_count",
    "count"(DISTINCT "j"."id") AS "jobs_count",
    "max"("j"."scheduled_date") AS "last_scheduled_date"
   FROM (("public"."locations" "l"
     LEFT JOIN "public"."equipment" "e" ON (("e"."location_id" = "l"."id")))
     LEFT JOIN "public"."jobs" "j" ON (("j"."location_id" = "l"."id")))
  GROUP BY "l"."customer_id", "l"."id", "l"."nickname", "l"."address_line1", "l"."address_line2", "l"."city", "l"."state", "l"."zip";




CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "email" "text",
    "phone" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "full_name" "text",
    "billing_address_line1" "text",
    "billing_address_line2" "text",
    "billing_city" "text",
    "billing_state" "text",
    "billing_zip" "text",
    "owner_user_id" "uuid" DEFAULT "auth"."uid"(),
    "billing_name" "text",
    "deleted_at" timestamp with time zone
);




CREATE OR REPLACE VIEW "public"."customer_summary" AS
 SELECT "c"."id" AS "customer_id",
    "c"."full_name",
    "c"."phone",
    "c"."email",
    "count"(DISTINCT "l"."id") AS "locations_count",
    "count"(DISTINCT "j"."id") AS "jobs_count",
    "max"("j"."scheduled_date") AS "last_scheduled_date"
   FROM (("public"."customers" "c"
     LEFT JOIN "public"."locations" "l" ON (("l"."customer_id" = "c"."id")))
     LEFT JOIN "public"."jobs" "j" ON (("j"."customer_id" = "c"."id")))
  GROUP BY "c"."id", "c"."full_name", "c"."phone", "c"."email";




CREATE TABLE IF NOT EXISTS "public"."ecc_test_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "test_type" "text" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "computed" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "computed_pass" boolean,
    "override_pass" boolean,
    "override_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "visit_id" "uuid",
    "is_completed" boolean DEFAULT false,
    "equipment_id" "uuid",
    "system_key" "text",
    "system_id" "uuid"
);




CREATE TABLE IF NOT EXISTS "public"."internal_users" (
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "role" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "account_owner_user_id" "uuid",
    "created_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."job_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "assigned_by" "uuid",
    "is_active" boolean DEFAULT true NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "removed_at" timestamp with time zone,
    "removed_by" "uuid",
    CONSTRAINT "job_assignments_primary_requires_active_chk" CHECK (((NOT "is_primary") OR ("is_active" = true))),
    CONSTRAINT "job_assignments_removed_consistency_chk" CHECK (((("is_active" = true) AND ("removed_at" IS NULL) AND ("removed_by" IS NULL)) OR ("is_active" = false)))
);




COMMENT ON TABLE "public"."job_assignments" IS 'Internal user staffing assignments for a job/visit. Additive layer for multi-technician support. Does not replace contractor ownership or job lifecycle.';



COMMENT ON COLUMN "public"."job_assignments"."job_id" IS 'Job/visit being staffed.';



COMMENT ON COLUMN "public"."job_assignments"."user_id" IS 'Internal user assigned to the job.';



COMMENT ON COLUMN "public"."job_assignments"."assigned_by" IS 'Internal user who created the assignment, if known.';



COMMENT ON COLUMN "public"."job_assignments"."is_active" IS 'True while the assignment is currently active; false once removed.';



COMMENT ON COLUMN "public"."job_assignments"."is_primary" IS 'Optional accountability flag. At most one active primary per job.';



CREATE TABLE IF NOT EXISTS "public"."job_equipment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "equipment_role" "text" NOT NULL,
    "manufacturer" "text",
    "model" "text",
    "serial" "text",
    "tonnage" numeric,
    "refrigerant_type" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "model_number" "text",
    "system_location" "text",
    "system_id" "uuid" NOT NULL,
    "component_type" "text"
);




CREATE TABLE IF NOT EXISTS "public"."job_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "message" "text",
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid"
);




CREATE TABLE IF NOT EXISTS "public"."job_systems" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."job_visits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "visit_number" integer NOT NULL,
    "scheduled_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "owner_user_id" "uuid" DEFAULT "auth"."uid"(),
    "status" "text" DEFAULT 'need_to_schedule'::"text",
    "window_start" timestamp with time zone,
    "window_end" timestamp with time zone,
    "outcome" "text",
    "closed_at" timestamp with time zone,
    "needs_another_visit" boolean DEFAULT false
);




CREATE OR REPLACE VIEW "public"."job_visit_test_summary" AS
 SELECT "j"."id" AS "job_id",
    "v"."id" AS "visit_id",
    "v"."visit_number",
    "v"."scheduled_at" AS "visit_scheduled_at",
    "v"."created_at" AS "visit_created_at",
    "count"("r"."id") AS "test_runs_count",
    "count"("r"."id") FILTER (WHERE (("r"."computed_pass" IS TRUE) OR ("r"."override_pass" IS TRUE))) AS "pass_count",
    "count"("r"."id") FILTER (WHERE (("r"."computed_pass" IS FALSE) AND ("r"."override_pass" IS NOT TRUE))) AS "fail_count",
    "max"("r"."created_at") AS "last_test_run_at"
   FROM (("public"."jobs" "j"
     JOIN "public"."job_visits" "v" ON (("v"."job_id" = "j"."id")))
     LEFT JOIN "public"."ecc_test_runs" "r" ON (("r"."visit_id" = "v"."id")))
  GROUP BY "j"."id", "v"."id", "v"."visit_number", "v"."scheduled_at", "v"."created_at";





CREATE OR REPLACE VIEW "public"."location_jobs" AS
 SELECT "location_id",
    "id" AS "job_id",
    "title",
    "job_type",
    "project_type",
    "status",
    "ops_status",
    "scheduled_date",
    "permit_number",
    "follow_up_date",
    "pending_info_reason"
   FROM "public"."jobs" "j"
  WHERE ("location_id" IS NOT NULL);




CREATE OR REPLACE VIEW "public"."location_summary" AS
 SELECT "l"."id" AS "location_id",
    "l"."customer_id",
    "c"."full_name" AS "customer_name",
    "c"."phone" AS "customer_phone",
    "c"."email" AS "customer_email",
    "l"."nickname",
    "l"."address_line1",
    "l"."address_line2",
    "l"."city",
    "l"."state",
    "l"."zip",
    "count"(DISTINCT "e"."id") AS "equipment_count",
    "count"(DISTINCT "j"."id") AS "jobs_count",
    "max"("j"."scheduled_date") AS "last_scheduled_date"
   FROM ((("public"."locations" "l"
     JOIN "public"."customers" "c" ON (("c"."id" = "l"."customer_id")))
     LEFT JOIN "public"."equipment" "e" ON (("e"."location_id" = "l"."id")))
     LEFT JOIN "public"."jobs" "j" ON (("j"."location_id" = "l"."id")))
  GROUP BY "l"."id", "l"."customer_id", "c"."full_name", "c"."phone", "c"."email", "l"."nickname", "l"."address_line1", "l"."address_line2", "l"."city", "l"."state", "l"."zip";




CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid",
    "recipient_type" "text" NOT NULL,
    "recipient_ref" "uuid",
    "channel" "text" NOT NULL,
    "notification_type" "text" NOT NULL,
    "subject" "text",
    "body" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "full_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."service_cases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid",
    "location_id" "uuid",
    "problem_summary" "text",
    "status" "text" DEFAULT 'open'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);




CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scheduled_date" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title" "text" NOT NULL,
    "city" "text",
    "status" "text",
    "job_id" "uuid",
    CONSTRAINT "services_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'closed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "services_title_not_blank" CHECK (("btrim"("title") <> ''::"text"))
);




ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contractor_invites"
    ADD CONSTRAINT "contractor_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contractor_users"
    ADD CONSTRAINT "contractor_users_pkey" PRIMARY KEY ("contractor_id", "user_id");



ALTER TABLE ONLY "public"."contractors"
    ADD CONSTRAINT "contractors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ecc_test_runs"
    ADD CONSTRAINT "ecc_test_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipment"
    ADD CONSTRAINT "equipment_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."internal_users"
    ADD CONSTRAINT "internal_users_pkey" PRIMARY KEY ("user_id");

CREATE OR REPLACE FUNCTION "public"."is_internal_user"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.internal_users iu
    where iu.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION "public"."debug_auth_context"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'uid', auth.uid(),
    'role', auth.role(),
    'is_internal_user', public.is_internal_user()
  );
$$;



ALTER TABLE ONLY "public"."job_assignments"
    ADD CONSTRAINT "job_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_equipment"
    ADD CONSTRAINT "job_equipment_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_events"
    ADD CONSTRAINT "job_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_systems"
    ADD CONSTRAINT "job_systems_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_visits"
    ADD CONSTRAINT "job_visits_job_id_visit_number_key" UNIQUE ("job_id", "visit_number");



ALTER TABLE ONLY "public"."job_visits"
    ADD CONSTRAINT "job_visits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_cases"
    ADD CONSTRAINT "service_cases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");



CREATE INDEX "attachments_created_at_idx" ON "public"."attachments" USING "btree" ("created_at");



CREATE INDEX "attachments_entity_idx" ON "public"."attachments" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "calendar_events_start_at_idx" ON "public"."calendar_events" USING "btree" ("start_at");



CREATE INDEX "contractor_invites_contractor_idx" ON "public"."contractor_invites" USING "btree" ("contractor_id");



CREATE INDEX "contractor_invites_email_idx" ON "public"."contractor_invites" USING "btree" ("lower"("email"));



CREATE UNIQUE INDEX "contractor_invites_owner_contractor_email_uidx" ON "public"."contractor_invites" USING "btree" ("owner_user_id", "contractor_id", "email");



CREATE INDEX "contractor_invites_owner_idx" ON "public"."contractor_invites" USING "btree" ("owner_user_id");



CREATE UNIQUE INDEX "contractor_invites_uniq" ON "public"."contractor_invites" USING "btree" ("owner_user_id", "contractor_id", "lower"("email"));



CREATE UNIQUE INDEX "contractor_users_one_owner_per_contractor" ON "public"."contractor_users" USING "btree" ("contractor_id") WHERE ("role" = 'owner'::"text");



CREATE UNIQUE INDEX "contractor_users_uniq" ON "public"."contractor_users" USING "btree" ("contractor_id", "user_id");



CREATE INDEX "contractor_users_user_id_idx" ON "public"."contractor_users" USING "btree" ("user_id");



CREATE INDEX "contractors_owner_user_id_idx" ON "public"."contractors" USING "btree" ("owner_user_id");



CREATE INDEX "customers_deleted_at_idx" ON "public"."customers" USING "btree" ("deleted_at");



CREATE INDEX "customers_email_idx" ON "public"."customers" USING "btree" ("email");



CREATE INDEX "customers_email_trgm_idx" ON "public"."customers" USING "gin" ("email" "public"."gin_trgm_ops");



CREATE INDEX "customers_full_name_idx" ON "public"."customers" USING "btree" ("full_name");



CREATE INDEX "customers_full_name_trgm_idx" ON "public"."customers" USING "gin" ("full_name" "public"."gin_trgm_ops");



CREATE INDEX "customers_name_idx" ON "public"."customers" USING "btree" ("last_name", "first_name");



CREATE INDEX "customers_owner_user_id_idx" ON "public"."customers" USING "btree" ("owner_user_id");



CREATE INDEX "customers_phone_digits_idx" ON "public"."customers" USING "btree" ("regexp_replace"(COALESCE("phone", ''::"text"), '\D'::"text", ''::"text", 'g'::"text"));



CREATE INDEX "customers_phone_idx" ON "public"."customers" USING "btree" ("phone");



CREATE INDEX "ecc_test_runs_job_id_idx" ON "public"."ecc_test_runs" USING "btree" ("job_id");



CREATE INDEX "ecc_test_runs_job_id_type_idx" ON "public"."ecc_test_runs" USING "btree" ("job_id", "test_type");



CREATE INDEX "ecc_test_runs_system_id_idx" ON "public"."ecc_test_runs" USING "btree" ("system_id");



CREATE UNIQUE INDEX "ecc_test_runs_unique_visit_equipment_test" ON "public"."ecc_test_runs" USING "btree" ("visit_id", "equipment_id", "test_type") WHERE (("visit_id" IS NOT NULL) AND ("equipment_id" IS NOT NULL));



CREATE INDEX "ecc_test_runs_visit_completed_idx" ON "public"."ecc_test_runs" USING "btree" ("visit_id", "is_completed");



CREATE INDEX "ecc_test_runs_visit_id_idx" ON "public"."ecc_test_runs" USING "btree" ("visit_id");



CREATE INDEX "equipment_location_id_idx" ON "public"."equipment" USING "btree" ("location_id");



CREATE INDEX "equipment_model_idx" ON "public"."equipment" USING "btree" ("model");



CREATE INDEX "equipment_owner_user_id_idx" ON "public"."equipment" USING "btree" ("owner_user_id");



CREATE INDEX "equipment_serial_idx" ON "public"."equipment" USING "btree" ("serial");



CREATE INDEX "idx_jobs_service_case_id" ON "public"."jobs" USING "btree" ("service_case_id");



CREATE INDEX "job_assignments_active_idx" ON "public"."job_assignments" USING "btree" ("is_active");



CREATE INDEX "job_assignments_job_active_idx" ON "public"."job_assignments" USING "btree" ("job_id", "is_active");



CREATE INDEX "job_assignments_job_id_idx" ON "public"."job_assignments" USING "btree" ("job_id");



CREATE UNIQUE INDEX "job_assignments_one_active_assignment_per_user_idx" ON "public"."job_assignments" USING "btree" ("job_id", "user_id") WHERE ("is_active" = true);



CREATE UNIQUE INDEX "job_assignments_one_active_primary_per_job_idx" ON "public"."job_assignments" USING "btree" ("job_id") WHERE (("is_primary" = true) AND ("is_active" = true));



CREATE INDEX "job_assignments_user_active_idx" ON "public"."job_assignments" USING "btree" ("user_id", "is_active");



CREATE INDEX "job_assignments_user_id_idx" ON "public"."job_assignments" USING "btree" ("user_id");



CREATE INDEX "job_equipment_job_id_idx" ON "public"."job_equipment" USING "btree" ("job_id");



CREATE INDEX "job_equipment_system_id_idx" ON "public"."job_equipment" USING "btree" ("system_id");



CREATE INDEX "job_events_created_at_idx" ON "public"."job_events" USING "btree" ("created_at");



CREATE INDEX "job_events_job_id_created_at_idx" ON "public"."job_events" USING "btree" ("job_id", "created_at" DESC);



CREATE INDEX "job_events_job_id_idx" ON "public"."job_events" USING "btree" ("job_id");



CREATE INDEX "job_events_user_id_idx" ON "public"."job_events" USING "btree" ("user_id");



CREATE INDEX "job_systems_job_id_idx" ON "public"."job_systems" USING "btree" ("job_id");



CREATE UNIQUE INDEX "job_systems_job_id_name_unique" ON "public"."job_systems" USING "btree" ("job_id", "name");



CREATE INDEX "job_visits_closed_at_idx" ON "public"."job_visits" USING "btree" ("closed_at");



CREATE INDEX "job_visits_job_id_idx" ON "public"."job_visits" USING "btree" ("job_id");



CREATE INDEX "job_visits_job_id_visit_number_idx" ON "public"."job_visits" USING "btree" ("job_id", "visit_number");



CREATE INDEX "job_visits_owner_user_id_idx" ON "public"."job_visits" USING "btree" ("owner_user_id");



CREATE INDEX "job_visits_scheduled_at_idx" ON "public"."job_visits" USING "btree" ("scheduled_at");



CREATE INDEX "job_visits_status_idx" ON "public"."job_visits" USING "btree" ("status");



CREATE INDEX "jobs_contractor_id_idx" ON "public"."jobs" USING "btree" ("contractor_id");



CREATE INDEX "jobs_customer_id_idx" ON "public"."jobs" USING "btree" ("customer_id");



CREATE INDEX "jobs_deleted_at_idx" ON "public"."jobs" USING "btree" ("deleted_at");



CREATE INDEX "jobs_follow_up_date_idx" ON "public"."jobs" USING "btree" ("follow_up_date");



CREATE INDEX "jobs_lifecycle_state_idx" ON "public"."jobs" USING "btree" ("lifecycle_state");



CREATE INDEX "jobs_location_id_idx" ON "public"."jobs" USING "btree" ("location_id");



CREATE INDEX "jobs_ops_status_idx" ON "public"."jobs" USING "btree" ("ops_status");



CREATE INDEX "jobs_parent_job_id_idx" ON "public"."jobs" USING "btree" ("parent_job_id");



CREATE INDEX "locations_address_trgm_idx" ON "public"."locations" USING "gin" ("address_line1" "public"."gin_trgm_ops");



CREATE INDEX "locations_city_idx" ON "public"."locations" USING "btree" ("city");



CREATE INDEX "locations_city_trgm_idx" ON "public"."locations" USING "gin" ("city" "public"."gin_trgm_ops");



CREATE INDEX "locations_customer_id_idx" ON "public"."locations" USING "btree" ("customer_id");



CREATE INDEX "locations_owner_user_id_idx" ON "public"."locations" USING "btree" ("owner_user_id");



CREATE INDEX "notifications_created_at_idx" ON "public"."notifications" USING "btree" ("created_at");



CREATE INDEX "notifications_job_id_idx" ON "public"."notifications" USING "btree" ("job_id");



CREATE INDEX "notifications_status_idx" ON "public"."notifications" USING "btree" ("status");



CREATE OR REPLACE TRIGGER "contractor_invites_set_updated_at" BEFORE UPDATE ON "public"."contractor_invites" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "profiles_set_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_ecc_test_runs_updated_at" BEFORE UPDATE ON "public"."ecc_test_runs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_job_equipment_updated_at" BEFORE UPDATE ON "public"."job_equipment" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


CREATE OR REPLACE FUNCTION "public"."prevent_job_parent_cycles"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  cycle_found boolean;
begin
  if new.parent_job_id is null then
    return new;
  end if;

  if new.parent_job_id = new.id then
    raise exception 'parent_job_id cannot equal job id';
  end if;

  with recursive chain as (
    select j.id, j.parent_job_id
    from public.jobs j
    where j.id = new.parent_job_id
    union all
    select j2.id, j2.parent_job_id
    from public.jobs j2
    join chain c on c.parent_job_id = j2.id
    where c.parent_job_id is not null
  )
  select exists (select 1 from chain where id = new.id) into cycle_found;

  if cycle_found then
    raise exception 'parent_job_id would create a cycle';
  end if;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."search_customers"("search_text" "text", "result_limit" integer DEFAULT 25) RETURNS TABLE("customer_id" "uuid", "full_name" "text", "phone" "text", "email" "text", "locations_count" bigint, "sample_location_id" "uuid", "sample_address" "text", "sample_city" "text")
    LANGUAGE "sql"
    AS $$
  with q as (
    select trim(coalesce(search_text, '')) as s,
           regexp_replace(coalesce(search_text, ''), '\\D', '', 'g') as digits
  ),
  matches as (
    select
      c.id as customer_id,
      coalesce(
        nullif(trim(coalesce(c.full_name, '')), ''),
        nullif(
          trim(
            concat_ws(
              ' ',
              nullif(trim(coalesce(c.first_name, '')), ''),
              nullif(trim(coalesce(c.last_name, '')), '')
            )
          ),
          ''
        )
      ) as full_name,
      c.phone,
      c.email,
      l.id as location_id,
      l.address_line1,
      l.city
    from public.customers c
    left join public.locations l
      on l.customer_id = c.id
    cross join q
    where
      q.s <> ''
      and (
        coalesce(
          nullif(trim(coalesce(c.full_name, '')), ''),
          nullif(
            trim(
              concat_ws(
                ' ',
                nullif(trim(coalesce(c.first_name, '')), ''),
                nullif(trim(coalesce(c.last_name, '')), '')
              )
            ),
            ''
          )
        ) ilike '%' || q.s || '%'
        or (q.digits <> '' and regexp_replace(coalesce(c.phone, ''), '\\D', '', 'g') like '%' || q.digits || '%')
        or l.address_line1 ilike '%' || q.s || '%'
        or l.city ilike '%' || q.s || '%'
      )
  ),
  grouped as (
    select
      m.customer_id,
      max(m.full_name) as full_name,
      max(m.phone) as phone,
      max(m.email) as email,
      count(distinct m.location_id) as locations_count
    from matches m
    group by m.customer_id
  ),
  first_location as (
    select distinct on (m.customer_id)
      m.customer_id,
      m.location_id,
      m.address_line1,
      m.city
    from matches m
    where m.location_id is not null
    order by m.customer_id, m.address_line1
  )
  select
    g.customer_id,
    g.full_name,
    g.phone,
    g.email,
    g.locations_count,
    f.location_id as sample_location_id,
    f.address_line1 as sample_address,
    f.city as sample_city
  from grouped g
  left join first_location f
    on f.customer_id = g.customer_id
  order by g.full_name nulls last
  limit result_limit;
$$;


CREATE OR REPLACE TRIGGER "trg_prevent_job_parent_cycles" BEFORE INSERT OR UPDATE OF "parent_job_id" ON "public"."jobs" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_job_parent_cycles"();



ALTER TABLE ONLY "public"."contractor_invites"
    ADD CONSTRAINT "contractor_invites_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contractor_users"
    ADD CONSTRAINT "contractor_users_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contractor_users"
    ADD CONSTRAINT "contractor_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contractors"
    ADD CONSTRAINT "contractors_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."ecc_test_runs"
    ADD CONSTRAINT "ecc_test_runs_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ecc_test_runs"
    ADD CONSTRAINT "ecc_test_runs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ecc_test_runs"
    ADD CONSTRAINT "ecc_test_runs_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "public"."job_systems"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ecc_test_runs"
    ADD CONSTRAINT "ecc_test_runs_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."job_visits"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."equipment"
    ADD CONSTRAINT "equipment_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."internal_users"
    ADD CONSTRAINT "internal_users_account_owner_user_id_fkey" FOREIGN KEY ("account_owner_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."internal_users"
    ADD CONSTRAINT "internal_users_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."internal_users"
    ADD CONSTRAINT "internal_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_assignments"
    ADD CONSTRAINT "job_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."job_assignments"
    ADD CONSTRAINT "job_assignments_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_assignments"
    ADD CONSTRAINT "job_assignments_removed_by_fkey" FOREIGN KEY ("removed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."job_assignments"
    ADD CONSTRAINT "job_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."job_equipment"
    ADD CONSTRAINT "job_equipment_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_equipment"
    ADD CONSTRAINT "job_equipment_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "public"."job_systems"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."job_events"
    ADD CONSTRAINT "job_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_events"
    ADD CONSTRAINT "job_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."job_systems"
    ADD CONSTRAINT "job_systems_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_visits"
    ADD CONSTRAINT "job_visits_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_parent_job_fk" FOREIGN KEY ("parent_job_id") REFERENCES "public"."jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_parent_job_id_fkey" FOREIGN KEY ("parent_job_id") REFERENCES "public"."jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE SET NULL;



ALTER TABLE "public"."attachments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attachments_contractor_insert_own_jobs" ON "public"."attachments" FOR INSERT TO "authenticated" WITH CHECK ((("entity_type" = 'job'::"text") AND (EXISTS ( SELECT 1
   FROM ("public"."jobs" "j"
     JOIN "public"."contractor_users" "cu" ON (("cu"."contractor_id" = "j"."contractor_id")))
  WHERE (("cu"."user_id" = "auth"."uid"()) AND ("j"."id" = "attachments"."entity_id"))))));



CREATE POLICY "attachments_contractor_select_own_jobs" ON "public"."attachments" FOR SELECT TO "authenticated" USING ((("entity_type" = 'job'::"text") AND (EXISTS ( SELECT 1
   FROM ("public"."jobs" "j"
     JOIN "public"."contractor_users" "cu" ON (("cu"."contractor_id" = "j"."contractor_id")))
  WHERE (("cu"."user_id" = "auth"."uid"()) AND ("j"."id" = "attachments"."entity_id") AND ("j"."deleted_at" IS NULL))))));



CREATE POLICY "attachments_internal_full_access" ON "public"."attachments" TO "authenticated" USING (((NOT (EXISTS ( SELECT 1
   FROM "public"."contractor_users" "cu"
  WHERE ("cu"."user_id" = "auth"."uid"())))) AND (("entity_type" <> 'job'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "attachments"."entity_id") AND ("j"."deleted_at" IS NULL))))))) WITH CHECK (((NOT (EXISTS ( SELECT 1
   FROM "public"."contractor_users" "cu"
  WHERE ("cu"."user_id" = "auth"."uid"())))) AND (("entity_type" <> 'job'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "attachments"."entity_id") AND ("j"."deleted_at" IS NULL)))))));



CREATE POLICY "contractor_delete_job_equipment" ON "public"."job_equipment" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."jobs" "j"
     JOIN "public"."contractors" "c" ON (("c"."id" = "j"."contractor_id")))
  WHERE (("j"."id" = "job_equipment"."job_id") AND ("c"."owner_user_id" = "auth"."uid"())))));



CREATE POLICY "contractor_delete_job_systems" ON "public"."job_systems" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."jobs" "j"
     JOIN "public"."contractors" "c" ON (("c"."id" = "j"."contractor_id")))
  WHERE (("j"."id" = "job_systems"."job_id") AND ("c"."owner_user_id" = "auth"."uid"())))));



CREATE POLICY "contractor_insert_job_equipment" ON "public"."job_equipment" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM ("public"."jobs" "j"
     JOIN "public"."contractors" "c" ON (("c"."id" = "j"."contractor_id")))
  WHERE (("j"."id" = "job_equipment"."job_id") AND ("c"."owner_user_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM "public"."job_systems" "js"
  WHERE (("js"."id" = "job_equipment"."system_id") AND ("js"."job_id" = "job_equipment"."job_id"))))));



CREATE POLICY "contractor_insert_job_systems" ON "public"."job_systems" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."jobs" "j"
     JOIN "public"."contractors" "c" ON (("c"."id" = "j"."contractor_id")))
  WHERE (("j"."id" = "job_systems"."job_id") AND ("c"."owner_user_id" = "auth"."uid"())))));



CREATE POLICY "contractor_insert_own_job_equipment" ON "public"."job_equipment" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "job_equipment"."job_id") AND ("j"."deleted_at" IS NULL) AND ("j"."contractor_id" = ( SELECT "cu"."contractor_id"
           FROM "public"."contractor_users" "cu"
          WHERE ("cu"."user_id" = "auth"."uid"())
         LIMIT 1))))) AND (EXISTS ( SELECT 1
   FROM "public"."job_systems" "js"
  WHERE (("js"."id" = "job_equipment"."system_id") AND ("js"."job_id" = "job_equipment"."job_id"))))));



CREATE POLICY "contractor_insert_own_job_events_limited" ON "public"."job_events" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM ("public"."jobs" "j"
     JOIN "public"."contractor_users" "cu" ON (("cu"."contractor_id" = "j"."contractor_id")))
  WHERE (("cu"."user_id" = "auth"."uid"()) AND ("j"."id" = "job_events"."job_id")))) AND ("event_type" = ANY (ARRAY['contractor_note'::"text", 'contractor_correction_submission'::"text", 'attachment_added'::"text", 'contractor_job_created'::"text", 'contractor_schedule_updated'::"text"]))));



CREATE POLICY "contractor_insert_own_job_systems" ON "public"."job_systems" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "job_systems"."job_id") AND ("j"."deleted_at" IS NULL) AND ("j"."contractor_id" = ( SELECT "cu"."contractor_id"
           FROM "public"."contractor_users" "cu"
          WHERE ("cu"."user_id" = "auth"."uid"())
         LIMIT 1))))));



CREATE POLICY "contractor_insert_own_jobs" ON "public"."jobs" FOR INSERT TO "authenticated" WITH CHECK (("contractor_id" = ( SELECT "cu"."contractor_id"
   FROM "public"."contractor_users" "cu"
  WHERE ("cu"."user_id" = "auth"."uid"())
 LIMIT 1)));



ALTER TABLE "public"."contractor_invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contractor_invites_insert" ON "public"."contractor_invites" FOR INSERT WITH CHECK ((("owner_user_id" = "auth"."uid"()) AND ("invited_by" = "auth"."uid"())));



CREATE POLICY "contractor_invites_select" ON "public"."contractor_invites" FOR SELECT USING (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "contractor_invites_update" ON "public"."contractor_invites" FOR UPDATE USING (("owner_user_id" = "auth"."uid"())) WITH CHECK (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "contractor_select_job_equipment" ON "public"."job_equipment" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."jobs" "j"
     JOIN "public"."contractors" "c" ON (("c"."id" = "j"."contractor_id")))
  WHERE (("j"."id" = "job_equipment"."job_id") AND ("c"."owner_user_id" = "auth"."uid"())))));



CREATE POLICY "contractor_select_job_systems" ON "public"."job_systems" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."jobs" "j"
     JOIN "public"."contractors" "c" ON (("c"."id" = "j"."contractor_id")))
  WHERE (("j"."id" = "job_systems"."job_id") AND ("c"."owner_user_id" = "auth"."uid"())))));



CREATE POLICY "contractor_select_locations_for_own_jobs" ON "public"."locations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."jobs" "j"
     JOIN "public"."contractor_users" "cu" ON (("cu"."contractor_id" = "j"."contractor_id")))
  WHERE (("j"."location_id" = "locations"."id") AND ("cu"."user_id" = "auth"."uid"()) AND ("j"."deleted_at" IS NULL)))));



CREATE POLICY "contractor_select_own_job_equipment" ON "public"."job_equipment" FOR SELECT TO "authenticated" USING (("job_id" IN ( SELECT "j"."id"
   FROM "public"."jobs" "j"
  WHERE (("j"."contractor_id" = ( SELECT "cu"."contractor_id"
           FROM "public"."contractor_users" "cu"
          WHERE ("cu"."user_id" = "auth"."uid"())
         LIMIT 1)) AND ("j"."deleted_at" IS NULL)))));



CREATE POLICY "contractor_select_own_job_events" ON "public"."job_events" FOR SELECT TO "authenticated" USING (("job_id" IN ( SELECT "j"."id"
   FROM "public"."jobs" "j"
  WHERE (("j"."contractor_id" = ( SELECT "cu"."contractor_id"
           FROM "public"."contractor_users" "cu"
          WHERE ("cu"."user_id" = "auth"."uid"())
         LIMIT 1)) AND ("j"."deleted_at" IS NULL)))));



CREATE POLICY "contractor_select_own_job_systems" ON "public"."job_systems" FOR SELECT TO "authenticated" USING (("job_id" IN ( SELECT "j"."id"
   FROM "public"."jobs" "j"
  WHERE (("j"."contractor_id" = ( SELECT "cu"."contractor_id"
           FROM "public"."contractor_users" "cu"
          WHERE ("cu"."user_id" = "auth"."uid"())
         LIMIT 1)) AND ("j"."deleted_at" IS NULL)))));



CREATE POLICY "contractor_select_own_jobs" ON "public"."jobs" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NULL) AND ("contractor_id" = ( SELECT "cu"."contractor_id"
   FROM "public"."contractor_users" "cu"
  WHERE ("cu"."user_id" = "auth"."uid"())
 LIMIT 1))));



CREATE POLICY "contractor_update_job_equipment" ON "public"."job_equipment" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."jobs" "j"
     JOIN "public"."contractors" "c" ON (("c"."id" = "j"."contractor_id")))
  WHERE (("j"."id" = "job_equipment"."job_id") AND ("c"."owner_user_id" = "auth"."uid"()))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM ("public"."jobs" "j"
     JOIN "public"."contractors" "c" ON (("c"."id" = "j"."contractor_id")))
  WHERE (("j"."id" = "job_equipment"."job_id") AND ("c"."owner_user_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM "public"."job_systems" "js"
  WHERE (("js"."id" = "job_equipment"."system_id") AND ("js"."job_id" = "job_equipment"."job_id"))))));



CREATE POLICY "contractor_update_job_systems" ON "public"."job_systems" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."jobs" "j"
     JOIN "public"."contractors" "c" ON (("c"."id" = "j"."contractor_id")))
  WHERE (("j"."id" = "job_systems"."job_id") AND ("c"."owner_user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."jobs" "j"
     JOIN "public"."contractors" "c" ON (("c"."id" = "j"."contractor_id")))
  WHERE (("j"."id" = "job_systems"."job_id") AND ("c"."owner_user_id" = "auth"."uid"())))));



CREATE POLICY "contractor_users_select_own" ON "public"."contractor_users" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customers_delete_owner" ON "public"."customers" FOR DELETE TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "customers_insert_owner" ON "public"."customers" FOR INSERT TO "authenticated" WITH CHECK (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "customers_select_owner" ON "public"."customers" FOR SELECT TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "customers_update_owner" ON "public"."customers" FOR UPDATE TO "authenticated" USING (("owner_user_id" = "auth"."uid"())) WITH CHECK (("owner_user_id" = "auth"."uid"()));



ALTER TABLE "public"."ecc_test_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ecc_test_runs_contractor_select_own" ON "public"."ecc_test_runs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."jobs" "j"
     JOIN "public"."contractor_users" "cu" ON (("cu"."contractor_id" = "j"."contractor_id")))
  WHERE (("cu"."user_id" = "auth"."uid"()) AND ("j"."id" = "ecc_test_runs"."job_id") AND ("j"."deleted_at" IS NULL)))));



CREATE POLICY "ecc_test_runs_internal_full_access" ON "public"."ecc_test_runs" TO "authenticated" USING (((NOT (EXISTS ( SELECT 1
   FROM "public"."contractor_users" "cu"
  WHERE ("cu"."user_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "ecc_test_runs"."job_id") AND ("j"."deleted_at" IS NULL)))))) WITH CHECK (((NOT (EXISTS ( SELECT 1
   FROM "public"."contractor_users" "cu"
  WHERE ("cu"."user_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "ecc_test_runs"."job_id") AND ("j"."deleted_at" IS NULL))))));



ALTER TABLE "public"."equipment" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "equipment_delete_owner" ON "public"."equipment" FOR DELETE TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "equipment_insert_owner" ON "public"."equipment" FOR INSERT TO "authenticated" WITH CHECK ((("owner_user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."locations" "l"
  WHERE (("l"."id" = "equipment"."location_id") AND ("l"."owner_user_id" = "auth"."uid"()))))));



CREATE POLICY "equipment_select_owner" ON "public"."equipment" FOR SELECT TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "equipment_update_owner" ON "public"."equipment" FOR UPDATE TO "authenticated" USING (("owner_user_id" = "auth"."uid"())) WITH CHECK ((("owner_user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."locations" "l"
  WHERE (("l"."id" = "equipment"."location_id") AND ("l"."owner_user_id" = "auth"."uid"()))))));



CREATE POLICY "internal_archive_jobs" ON "public"."jobs" FOR UPDATE TO "authenticated" USING ((("deleted_at" IS NULL) AND "public"."is_internal_user"())) WITH CHECK ("public"."is_internal_user"());



CREATE POLICY "internal_full_access_job_equipment" ON "public"."job_equipment" TO "authenticated" USING (((NOT (EXISTS ( SELECT 1
   FROM "public"."contractor_users" "cu"
  WHERE ("cu"."user_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "job_equipment"."job_id") AND ("j"."deleted_at" IS NULL)))))) WITH CHECK (((NOT (EXISTS ( SELECT 1
   FROM "public"."contractor_users" "cu"
  WHERE ("cu"."user_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "job_equipment"."job_id") AND ("j"."deleted_at" IS NULL))))));



CREATE POLICY "internal_full_access_job_events" ON "public"."job_events" TO "authenticated" USING (((NOT (EXISTS ( SELECT 1
   FROM "public"."contractor_users" "cu"
  WHERE ("cu"."user_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "job_events"."job_id") AND ("j"."deleted_at" IS NULL)))))) WITH CHECK (((NOT (EXISTS ( SELECT 1
   FROM "public"."contractor_users" "cu"
  WHERE ("cu"."user_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "job_events"."job_id") AND ("j"."deleted_at" IS NULL))))));



CREATE POLICY "internal_full_access_job_systems" ON "public"."job_systems" TO "authenticated" USING (((NOT (EXISTS ( SELECT 1
   FROM "public"."contractor_users" "cu"
  WHERE ("cu"."user_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "job_systems"."job_id") AND ("j"."deleted_at" IS NULL)))))) WITH CHECK (((NOT (EXISTS ( SELECT 1
   FROM "public"."contractor_users" "cu"
  WHERE ("cu"."user_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "job_systems"."job_id") AND ("j"."deleted_at" IS NULL))))));



CREATE POLICY "internal_full_access_jobs" ON "public"."jobs" TO "authenticated" USING ("public"."is_internal_user"()) WITH CHECK ("public"."is_internal_user"());



CREATE POLICY "internal_full_access_service_cases" ON "public"."service_cases" TO "authenticated" USING ((NOT (EXISTS ( SELECT 1
   FROM "public"."contractor_users" "cu"
  WHERE ("cu"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."internal_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "internal_users_select_self" ON "public"."internal_users" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "internal_users_self_select" ON "public"."internal_users" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."job_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "job_assignments_insert_internal_active" ON "public"."job_assignments" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."internal_users" "iu"
  WHERE (("iu"."user_id" = "auth"."uid"()) AND ("iu"."is_active" = true)))) AND (("assigned_by" IS NULL) OR ("assigned_by" = "auth"."uid"()))));



CREATE POLICY "job_assignments_select_internal_active" ON "public"."job_assignments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."internal_users" "iu"
  WHERE (("iu"."user_id" = "auth"."uid"()) AND ("iu"."is_active" = true)))));



CREATE POLICY "job_assignments_update_internal_active" ON "public"."job_assignments" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."internal_users" "iu"
  WHERE (("iu"."user_id" = "auth"."uid"()) AND ("iu"."is_active" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."internal_users" "iu"
  WHERE (("iu"."user_id" = "auth"."uid"()) AND ("iu"."is_active" = true)))));



ALTER TABLE "public"."job_equipment" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_systems" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_visits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "job_visits_delete_contractor" ON "public"."job_visits" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."jobs" "j"
     JOIN "public"."contractor_users" "cu" ON (("cu"."contractor_id" = "j"."contractor_id")))
  WHERE (("j"."id" = "job_visits"."job_id") AND ("cu"."user_id" = "auth"."uid"())))));



CREATE POLICY "job_visits_delete_internal" ON "public"."job_visits" FOR DELETE TO "authenticated" USING ((NOT (EXISTS ( SELECT 1
   FROM "public"."contractor_users" "cu"
  WHERE ("cu"."user_id" = "auth"."uid"())))));



CREATE POLICY "job_visits_delete_owner" ON "public"."job_visits" FOR DELETE TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "job_visits_insert_contractor" ON "public"."job_visits" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."jobs" "j"
     JOIN "public"."contractor_users" "cu" ON (("cu"."contractor_id" = "j"."contractor_id")))
  WHERE (("j"."id" = "job_visits"."job_id") AND ("cu"."user_id" = "auth"."uid"())))));



CREATE POLICY "job_visits_insert_internal" ON "public"."job_visits" FOR INSERT TO "authenticated" WITH CHECK ((NOT (EXISTS ( SELECT 1
   FROM "public"."contractor_users" "cu"
  WHERE ("cu"."user_id" = "auth"."uid"())))));



CREATE POLICY "job_visits_insert_owner" ON "public"."job_visits" FOR INSERT TO "authenticated" WITH CHECK ((("owner_user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM ("public"."jobs" "j"
     JOIN "public"."customers" "c" ON (("c"."id" = "j"."customer_id")))
  WHERE (("j"."id" = "job_visits"."job_id") AND ("c"."owner_user_id" = "auth"."uid"()))))));



CREATE POLICY "job_visits_select_contractor" ON "public"."job_visits" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."jobs" "j"
     JOIN "public"."contractor_users" "cu" ON (("cu"."contractor_id" = "j"."contractor_id")))
  WHERE (("j"."id" = "job_visits"."job_id") AND ("cu"."user_id" = "auth"."uid"())))));



CREATE POLICY "job_visits_select_internal" ON "public"."job_visits" FOR SELECT TO "authenticated" USING ((NOT (EXISTS ( SELECT 1
   FROM "public"."contractor_users" "cu"
  WHERE ("cu"."user_id" = "auth"."uid"())))));



CREATE POLICY "job_visits_select_owner" ON "public"."job_visits" FOR SELECT TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "job_visits_update_contractor" ON "public"."job_visits" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."jobs" "j"
     JOIN "public"."contractor_users" "cu" ON (("cu"."contractor_id" = "j"."contractor_id")))
  WHERE (("j"."id" = "job_visits"."job_id") AND ("cu"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."jobs" "j"
     JOIN "public"."contractor_users" "cu" ON (("cu"."contractor_id" = "j"."contractor_id")))
  WHERE (("j"."id" = "job_visits"."job_id") AND ("cu"."user_id" = "auth"."uid"())))));



CREATE POLICY "job_visits_update_internal" ON "public"."job_visits" FOR UPDATE TO "authenticated" USING ((NOT (EXISTS ( SELECT 1
   FROM "public"."contractor_users" "cu"
  WHERE ("cu"."user_id" = "auth"."uid"()))))) WITH CHECK ((NOT (EXISTS ( SELECT 1
   FROM "public"."contractor_users" "cu"
  WHERE ("cu"."user_id" = "auth"."uid"())))));



CREATE POLICY "job_visits_update_owner" ON "public"."job_visits" FOR UPDATE TO "authenticated" USING (("owner_user_id" = "auth"."uid"())) WITH CHECK ((("owner_user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM ("public"."jobs" "j"
     JOIN "public"."customers" "c" ON (("c"."id" = "j"."customer_id")))
  WHERE (("j"."id" = "job_visits"."job_id") AND ("c"."owner_user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "locations_delete_owner" ON "public"."locations" FOR DELETE TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "locations_insert_owner" ON "public"."locations" FOR INSERT TO "authenticated" WITH CHECK ((("owner_user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "locations"."customer_id") AND ("c"."owner_user_id" = "auth"."uid"()))))));



CREATE POLICY "locations_select_owner" ON "public"."locations" FOR SELECT TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "locations_update_owner" ON "public"."locations" FOR UPDATE TO "authenticated" USING (("owner_user_id" = "auth"."uid"())) WITH CHECK ((("owner_user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "locations"."customer_id") AND ("c"."owner_user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."service_cases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_cases_contractor_insert" ON "public"."service_cases" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."contractor_users" "cu"
  WHERE ("cu"."user_id" = "auth"."uid"()))));



CREATE POLICY "service_cases_contractor_select" ON "public"."service_cases" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."contractor_users" "cu"
  WHERE ("cu"."user_id" = "auth"."uid"()))));



CREATE POLICY "service_cases_internal_full_access" ON "public"."service_cases" TO "authenticated" USING ((NOT (EXISTS ( SELECT 1
   FROM "public"."contractor_users" "cu"
  WHERE ("cu"."user_id" = "auth"."uid"()))))) WITH CHECK ((NOT (EXISTS ( SELECT 1
   FROM "public"."contractor_users" "cu"
  WHERE ("cu"."user_id" = "auth"."uid"())))));








CREATE OR REPLACE FUNCTION "public"."handle_new_auth_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;








CREATE OR REPLACE FUNCTION "public"."is_job_owned_by_current_contractor"("p_job_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1
    from public.jobs j
    join public.contractor_users cu
      on cu.contractor_id = j.contractor_id
    where cu.user_id = auth.uid()
      and j.id = p_job_id
      and j.deleted_at is null
  );
$$;




CREATE OR REPLACE FUNCTION "public"."portal_job_counts"() RETURNS TABLE("ops_status" "text", "ct" bigint)
    LANGUAGE "sql" STABLE
    AS $$
  select j.ops_status, count(*) as ct
  from public.jobs j
  where j.deleted_at is null
  group by j.ops_status;
$$;




CREATE OR REPLACE FUNCTION "public"."portal_job_counts"("p_contractor_id" "uuid") RETURNS TABLE("ops_status" "text", "ct" bigint)
    LANGUAGE "sql" STABLE
    AS $$
  select j.ops_status, count(*) as ct
  from public.jobs j
  where j.deleted_at is null
    and j.contractor_id = p_contractor_id
  group by j.ops_status;
$$;



