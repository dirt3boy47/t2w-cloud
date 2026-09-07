-- Read-oriented views for Power BI and ad-hoc reporting.
-- Application traffic still goes through the Node API. Direct Supabase Data API
-- access remains revoked for anon/authenticated roles.

CREATE OR REPLACE VIEW rpt_daily_profit AS
SELECT
  "Date" AS work_date,
  "Recorded By" AS recorded_by,
  "Shift" AS shift,
  COALESCE("Earned ($)",0)::double precision AS earned,
  COALESCE("Direct Cost ($)",0)::double precision AS direct_cost,
  COALESCE("Plant and Labour ($)",0)::double precision AS plant_labour_cost,
  COALESCE("Total Cost ($)",0)::double precision AS total_cost,
  COALESCE("Profit ($)",0)::double precision AS profit,
  COALESCE("Margin %",0)::double precision AS margin_pct,
  COALESCE("Crew Hours",0)::double precision AS crew_hours,
  "Notes" AS notes
FROM tblDailyProfit;

CREATE OR REPLACE VIEW rpt_daily_progress AS
SELECT
  "Date" AS work_date,
  "Recorded By" AS recorded_by,
  "Shift" AS shift,
  "Pipeline Section" AS section,
  COALESCE("Trench From Ch (m)",0)::double precision AS trench_from_m,
  COALESCE("Trench To Ch (m)",0)::double precision AS trench_to_m,
  COALESCE("Trench m Today",0)::double precision AS trench_m_today,
  COALESCE("Pipe From Ch (m)",0)::double precision AS pipe_from_m,
  COALESCE("Pipe To Ch (m)",0)::double precision AS pipe_to_m,
  COALESCE("Pipe m Today",0)::double precision AS pipe_m_today,
  COALESCE("Point Assets Complete",0)::double precision AS point_assets_complete,
  COALESCE("Earned Today ($)",0)::double precision AS earned_today,
  COALESCE("Our Cost Today ($)",0)::double precision AS direct_cost_today,
  COALESCE("Gross Margin Today ($)",0)::double precision AS gross_margin_today,
  "Weather" AS weather,
  COALESCE("Downtime (hrs)",0)::double precision AS downtime_hours,
  "Notes" AS notes
FROM tblDailyProgress;

CREATE OR REPLACE VIEW rpt_crew_plant_labour AS
SELECT
  d."Date" AS work_date,
  d."Pipeline Section" AS section,
  d."Crew" AS crew,
  d."Type" AS resource_type,
  d."Description" AS description,
  COALESCE(d."Number",1)::double precision AS quantity,
  COALESCE(d."Hours",0)::double precision AS hours_each,
  COALESCE(d."Standby Hours",0)::double precision AS standby_hours,
  COALESCE(d."Number",1) * COALESCE(d."Hours",0) AS total_hours,
  COALESCE(r."Charge Rate ($/h)",0)::double precision AS charge_rate_per_hour,
  COALESCE(r."Cost Rate ($/h)",0)::double precision AS cost_rate_per_hour,
  COALESCE(d."Number",1) * COALESCE(d."Hours",0) * COALESCE(r."Cost Rate ($/h)",0) AS cost,
  d."Recorded By" AS recorded_by,
  d."Notes" AS notes
FROM tblDailyPlantLabour d
LEFT JOIN tblRatePlantLabour r ON r."Description" = d."Description";

CREATE OR REPLACE VIEW rpt_asset_status AS
SELECT
  "Record Key" AS record_key,
  "Pipeline Section" AS section,
  "Register" AS register,
  "Asset Type" AS asset_type,
  "Asset ID" AS asset_id,
  "Chainage Start (m)" AS chainage_start_m,
  "Chainage End (m)" AS chainage_end_m,
  "Length (m)" AS length_m,
  "Completion Driver" AS completion_driver,
  "Complete" AS complete,
  "Completion Date" AS completion_date,
  "Installed" AS installed,
  "Install Date" AS install_date,
  "Unit Rate ($)" AS unit_rate,
  "Quantity" AS quantity,
  "Total Cost ($)" AS budget_value,
  "Crew" AS crew,
  "Drawing (Start)" AS drawing_start,
  "Feature Name" AS feature_name,
  "Utility Description" AS utility_description
FROM tblAsset;

CREATE OR REPLACE VIEW rpt_safety AS
SELECT
  "Date" AS work_date,
  "Recorded By" AS recorded_by,
  "Toolbox Held" AS toolbox_held,
  "Toolbox Topic" AS toolbox_topic,
  "Personnel On Site" AS personnel_on_site,
  "Incident Class" AS incident_class,
  "Incident Detail" AS incident_detail,
  "Lost Time (hrs)" AS lost_time_hours
FROM tblDailySafety;

REVOKE ALL ON rpt_daily_profit FROM anon, authenticated;
REVOKE ALL ON rpt_daily_progress FROM anon, authenticated;
REVOKE ALL ON rpt_crew_plant_labour FROM anon, authenticated;
REVOKE ALL ON rpt_asset_status FROM anon, authenticated;
REVOKE ALL ON rpt_safety FROM anon, authenticated;
