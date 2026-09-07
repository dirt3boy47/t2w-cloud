-- T2W cloud schema for Supabase Postgres
-- Generated from schema.json and the source CSVs. Mixed legacy columns remain TEXT; operational numeric columns are strongly typed.

CREATE TABLE IF NOT EXISTS tblAsset (
  "Record Key" TEXT PRIMARY KEY,
  "Chainage Start (m)" DOUBLE PRECISION,
  "Chainage End (m)" DOUBLE PRECISION,
  "Length (m)" DOUBLE PRECISION,
  "Pipeline Section" TEXT,
  "Register" TEXT,
  "Asset Type" TEXT,
  "Asset ID" TEXT,
  "Trench Type" TEXT,
  "Source Length (m)" DOUBLE PRECISION,
  "Drawing (Start)" TEXT,
  "Drawing (End)" TEXT,
  "Drawing (superseded)" TEXT,
  "Info Source" TEXT,
  "Included in Current Plan" TEXT,
  "Section Ref (source)" TEXT,
  "Feature Name" TEXT,
  "Utility Description" TEXT,
  "Surface" TEXT,
  "Pipeline DN" INTEGER,
  "Embankment Treatment" TEXT,
  "Creek Bed Treatment" TEXT,
  "Pipe Description" TEXT,
  "Type 6 (m)" DOUBLE PRECISION,
  "Type 7 (m)" DOUBLE PRECISION,
  "Type 4 & 7 (m)" DOUBLE PRECISION,
  "Type 4 & 6 (m)" DOUBLE PRECISION,
  "Operator" TEXT,
  "Location" TEXT,
  "Material" TEXT,
  "Size (mm)" TEXT,
  "ID" TEXT,
  "Actual Chainage (surveyed)" DOUBLE PRECISION,
  "Located" TEXT,
  "C&G Code" TEXT,
  "Trench Code" TEXT,
  "Surveyors PtNo" TEXT,
  "E" DOUBLE PRECISION,
  "N" DOUBLE PRECISION,
  "Z" DOUBLE PRECISION,
  "Survey Code" TEXT,
  "Proven to Underside of Service" TEXT,
  "Test Point" TEXT,
  "Proposed Crossing Method" TEXT,
  "Parallel or Crossed" TEXT,
  "Design Drawing" TEXT,
  "DBYD SEQ" TEXT,
  "Separation (m)" DOUBLE PRECISION,
  "Asset DOC (m)" DOUBLE PRECISION,
  "Pipeline DOC (m)" DOUBLE PRECISION,
  "Depth to Underside of Asset (m)" DOUBLE PRECISION,
  "Crossover" TEXT,
  "Within" TEXT,
  "Excavation Permit Required?" TEXT,
  "Excavation Permit Date" TEXT,
  "Crossing Permit Required?" TEXT,
  "Crossing Permit Date" TEXT,
  "Comments" TEXT,
  "Source File" TEXT,
  "Source Row" TEXT,
  "Area (m2)" TEXT,
  "Timber Density" TEXT,
  "Thrust Block Category" TEXT,
  "Installed" TEXT,
  "Install Date" TEXT,
  "Installed By" TEXT,
  "Test Document No" TEXT,
  "Test Status" TEXT,
  "Test Date" TEXT,
  "Complete" TEXT,
  "Completion Date" TEXT,
  "Progress Notes" TEXT,
  "Unit Rate ($)" DOUBLE PRECISION,
  "Quantity" INTEGER,
  "Unit" TEXT,
  "Total Cost ($)" DOUBLE PRECISION,
  "Fitting Type" TEXT,
  "Type of Bend" TEXT,
  "Fitting Material" TEXT,
  "Fitting DN (mm)" INTEGER,
  "Max Test Pressure (kPa)" INTEGER,
  "Allowable Lateral Bearing (kPa)" INTEGER,
  "Thrust Block Item" TEXT,
  "Design Source" TEXT,
  "Valve Type" TEXT,
  "Crossing Type" TEXT,
  "Crew" TEXT,
  "Bend Rate Class" TEXT,
  "Completion Driver" TEXT,
  "Front Chainage (m)" INTEGER,
  "Auto Complete" TEXT,
  "Auto Complete As At" TEXT,
  "Col93" DOUBLE PRECISION,
  "Valve Arrangement Type" TEXT,
  "Valve Assembly Group" TEXT,
  "Valve Arrangement" TEXT,
  "Branch / Tee Size" TEXT,
  "Air Valve" TEXT,
  "Scour Valve" TEXT,
  "Side" TEXT,
  "Invert Level (m)" DOUBLE PRECISION,
  "Depth of Invert (m)" DOUBLE PRECISION,
  "Natural Surface (m)" DOUBLE PRECISION,
  "Orifice Plate Bore (mm)" TEXT,
  "Within 1% AEP Flood Zone" TEXT,
  "Claim Item No (PC02)" TEXT,
  "Location Drawing Ref" TEXT
);

CREATE INDEX IF NOT EXISTS ix_tblasset_chainagestartm ON tblAsset ("Chainage Start (m)");
CREATE INDEX IF NOT EXISTS ix_tblasset_pipelinesection ON tblAsset ("Pipeline Section");
CREATE INDEX IF NOT EXISTS ix_tblasset_register ON tblAsset ("Register");
CREATE INDEX IF NOT EXISTS ix_tblasset_assettype ON tblAsset ("Asset Type");
CREATE INDEX IF NOT EXISTS ix_tblasset_assetid ON tblAsset ("Asset ID");
CREATE INDEX IF NOT EXISTS ix_tblasset_trenchtype ON tblAsset ("Trench Type");
CREATE INDEX IF NOT EXISTS ix_tblasset_complete ON tblAsset ("Complete");

CREATE TABLE IF NOT EXISTS tblRateTrench (
  _id BIGSERIAL PRIMARY KEY,
  "Pipeline Section" TEXT,
  "Trench Type" TEXT,
  "Description" TEXT,
  "Unit" TEXT,
  "Rate" DOUBLE PRECISION,
  "Effective From" TEXT,
  "Rate Source / Basis" TEXT,
  "Sections in register" INTEGER,
  "Lookup Key" TEXT,
  "Cost Rate" DOUBLE PRECISION,
  "Margin ($)" DOUBLE PRECISION,
  "Margin %" DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS ix_tblratetrench_pipelinesection ON tblRateTrench ("Pipeline Section");
CREATE INDEX IF NOT EXISTS ix_tblratetrench_trenchtype ON tblRateTrench ("Trench Type");

CREATE TABLE IF NOT EXISTS tblRatePipe (
  _id BIGSERIAL PRIMARY KEY,
  "Pipeline Section" TEXT,
  "Pipe Type" TEXT,
  "Pipe Description" TEXT,
  "Nominal Size" TEXT,
  "Unit" TEXT,
  "Rate" DOUBLE PRECISION,
  "Effective From" TEXT,
  "Rate Source / Basis" TEXT,
  "Lookup Key" TEXT,
  "Cost Rate" DOUBLE PRECISION,
  "Margin ($)" DOUBLE PRECISION,
  "Margin %" DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS ix_tblratepipe_pipelinesection ON tblRatePipe ("Pipeline Section");
CREATE INDEX IF NOT EXISTS ix_tblratepipe_pipetype ON tblRatePipe ("Pipe Type");

CREATE TABLE IF NOT EXISTS tblRatePoint (
  _id BIGSERIAL PRIMARY KEY,
  "Asset Type" TEXT,
  "Unit" TEXT,
  "Rate" DOUBLE PRECISION,
  "Effective From" TEXT,
  "Rate Source / Basis" TEXT,
  "Status" TEXT,
  "Cost Rate" DOUBLE PRECISION,
  "Margin ($)" DOUBLE PRECISION,
  "Margin %" DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS ix_tblratepoint_assettype ON tblRatePoint ("Asset Type");

CREATE TABLE IF NOT EXISTS tblRateThrustBlock (
  _id BIGSERIAL PRIMARY KEY,
  "Pipeline Section" TEXT,
  "Thrust Block Type" TEXT,
  "Item" TEXT,
  "Fitting" TEXT,
  "Angle / Size" TEXT,
  "Material" TEXT,
  "DN (mm)" INTEGER,
  "Blocks" INTEGER,
  "Unit" TEXT,
  "Rate" INTEGER,
  "Cuts" INTEGER,
  "Effective From" TEXT,
  "Rate Source / Basis" TEXT,
  "Lookup Key" TEXT,
  "Cost Rate" DOUBLE PRECISION,
  "Margin ($)" DOUBLE PRECISION,
  "Margin %" DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS ix_tblratethrustblock_pipelinesection ON tblRateThrustBlock ("Pipeline Section");
CREATE INDEX IF NOT EXISTS ix_tblratethrustblock_thrustblocktype ON tblRateThrustBlock ("Thrust Block Type");

CREATE TABLE IF NOT EXISTS tblRateBend (
  _id BIGSERIAL PRIMARY KEY,
  "Pipeline Section" TEXT,
  "Bend Rate Class" TEXT,
  "Description" TEXT,
  "Material" TEXT,
  "DN (mm)" INTEGER,
  "Bends" INTEGER,
  "Unit" TEXT,
  "Rate" DOUBLE PRECISION,
  "Effective From" TEXT,
  "Rate Source / Basis" TEXT,
  "Lookup Key" TEXT,
  "Cost Rate" DOUBLE PRECISION,
  "Margin ($)" DOUBLE PRECISION,
  "Margin %" DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS ix_tblratebend_pipelinesection ON tblRateBend ("Pipeline Section");
CREATE INDEX IF NOT EXISTS ix_tblratebend_bendrateclass ON tblRateBend ("Bend Rate Class");

CREATE TABLE IF NOT EXISTS tblRateValve (
  _id BIGSERIAL PRIMARY KEY,
  "Pipeline Section" TEXT,
  "Valve Class" TEXT,
  "Valve Type" TEXT,
  "Description" TEXT,
  "DN (mm)" INTEGER,
  "Valves" INTEGER,
  "Unit" TEXT,
  "Rate" INTEGER,
  "Effective From" TEXT,
  "Rate Source / Basis" TEXT,
  "Lookup Key" TEXT,
  "Cost Rate" DOUBLE PRECISION,
  "Margin ($)" DOUBLE PRECISION,
  "Margin %" DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS ix_tblratevalve_pipelinesection ON tblRateValve ("Pipeline Section");
CREATE INDEX IF NOT EXISTS ix_tblratevalve_valveclass ON tblRateValve ("Valve Class");

CREATE TABLE IF NOT EXISTS tblRatePlantLabour (
  _id BIGSERIAL PRIMARY KEY,
  "Type" TEXT,
  "Description" TEXT,
  "Unit" TEXT,
  "Charge Rate ($/h)" INTEGER,
  "Cost Rate ($/h)" INTEGER,
  "Margin ($/h)" INTEGER,
  "Notes" TEXT
);

CREATE INDEX IF NOT EXISTS ix_tblrateplantlabour_description ON tblRatePlantLabour ("Description");

CREATE TABLE IF NOT EXISTS tblProgressControl (
  "Pipeline Section" TEXT PRIMARY KEY,
  "Section extent (m)" DOUBLE PRECISION,
  "PIPE" INTEGER,
  "TRENCH" INTEGER,
  "As At Date" TEXT,
  "Updated By" TEXT
);


CREATE TABLE IF NOT EXISTS tblTrenchProgress (
  "Record Key" TEXT PRIMARY KEY,
  "Pipe Type" TEXT,
  "Trench Complete (m)" DOUBLE PRECISION,
  "Pipe Laid (m)" DOUBLE PRECISION,
  "As At Date" TEXT,
  "Updated By" TEXT,
  "Notes" TEXT
);


CREATE TABLE IF NOT EXISTS tblDailyProgress (
  _id BIGSERIAL PRIMARY KEY,
  "Date" TEXT,
  "Recorded By" TEXT,
  "Shift" TEXT,
  "Pipeline Section" TEXT,
  "Trench From Ch (m)" DOUBLE PRECISION,
  "Trench To Ch (m)" DOUBLE PRECISION,
  "Trench m Today" DOUBLE PRECISION,
  "Pipe From Ch (m)" DOUBLE PRECISION,
  "Pipe To Ch (m)" DOUBLE PRECISION,
  "Pipe m Today" DOUBLE PRECISION,
  "Point Assets Complete" DOUBLE PRECISION,
  "Earned Today ($)" DOUBLE PRECISION,
  "Our Cost Today ($)" DOUBLE PRECISION,
  "Gross Margin Today ($)" DOUBLE PRECISION,
  "Weather" TEXT,
  "Downtime (hrs)" DOUBLE PRECISION,
  "Notes" TEXT
);

CREATE INDEX IF NOT EXISTS ix_tbldailyprogress_date ON tblDailyProgress ("Date");

CREATE TABLE IF NOT EXISTS tblDailyPlantLabour (
  _id BIGSERIAL PRIMARY KEY,
  "Date" TEXT,
  "Recorded By" TEXT,
  "Pipeline Section" TEXT,
  "Crew" TEXT,
  "Type" TEXT,
  "Description" TEXT,
  "Number" DOUBLE PRECISION,
  "Hours" DOUBLE PRECISION,
  "Standby Hours" DOUBLE PRECISION,
  "Notes" TEXT
);

CREATE INDEX IF NOT EXISTS ix_tbldailyplantlabour_date ON tblDailyPlantLabour ("Date");

CREATE TABLE IF NOT EXISTS tblDailySafety (
  _id BIGSERIAL PRIMARY KEY,
  "Date" TEXT,
  "Recorded By" TEXT,
  "Toolbox Held" TEXT,
  "Toolbox Topic" TEXT,
  "Personnel On Site" DOUBLE PRECISION,
  "Incident Class" TEXT,
  "Incident Detail" TEXT,
  "Lost Time (hrs)" DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS ix_tbldailysafety_date ON tblDailySafety ("Date");

CREATE TABLE IF NOT EXISTS tblDailyHoldPoint (
  _id BIGSERIAL PRIMARY KEY,
  "Date" TEXT,
  "Recorded By" TEXT,
  "Reference" TEXT,
  "Description" TEXT,
  "Status" TEXT,
  "Record Key" TEXT,
  "Notes" TEXT
);

CREATE INDEX IF NOT EXISTS ix_tbldailyholdpoint_date ON tblDailyHoldPoint ("Date");

CREATE TABLE IF NOT EXISTS tblDailyProfit (
  _id BIGSERIAL PRIMARY KEY,
  "Date" TEXT,
  "Recorded By" TEXT,
  "Shift" TEXT,
  "Earned ($)" DOUBLE PRECISION,
  "Direct Cost ($)" DOUBLE PRECISION,
  "Plant and Labour ($)" DOUBLE PRECISION,
  "Total Cost ($)" DOUBLE PRECISION,
  "Profit ($)" DOUBLE PRECISION,
  "Margin %" DOUBLE PRECISION,
  "Trench m" TEXT,
  "Pipe m" TEXT,
  "Crew Hours" DOUBLE PRECISION,
  "Notes" TEXT
);

CREATE INDEX IF NOT EXISTS ix_tbldailyprofit_date ON tblDailyProfit ("Date");

CREATE TABLE IF NOT EXISTS tblEditLog (
  _id BIGSERIAL PRIMARY KEY,
  "Timestamp" TEXT,
  "Edited by" TEXT,
  "Record Key" TEXT,
  "Asset ID" TEXT,
  "Field" TEXT,
  "Previous value" TEXT,
  "New value" TEXT,
  "Sheet cell" TEXT
);

CREATE INDEX IF NOT EXISTS ix_tbleditlog_recordkey ON tblEditLog ("Record Key");
CREATE INDEX IF NOT EXISTS ix_tbleditlog_timestamp ON tblEditLog ("Timestamp");

CREATE TABLE IF NOT EXISTS tblDataQuality (
  _id BIGSERIAL PRIMARY KEY,
  "Register" TEXT,
  "Source row(s)" TEXT,
  "Issue" TEXT,
  "Resolution" TEXT,
  "Detail" TEXT
);

CREATE INDEX IF NOT EXISTS ix_tbldataquality_register ON tblDataQuality ("Register");

CREATE TABLE IF NOT EXISTS tblRevision (
  _id BIGSERIAL PRIMARY KEY,
  "Revision" TEXT,
  "Date" TEXT,
  "Description of change" TEXT,
  "Records affected" TEXT,
  "Issued by" TEXT
);


CREATE TABLE IF NOT EXISTS tblValveScheduleReview (
  _id BIGSERIAL PRIMARY KEY,
  "Record Key" TEXT,
  "MR Row" TEXT,
  "Chainage (register)" DOUBLE PRECISION,
  "Chainage (IFC drawing)" DOUBLE PRECISION,
  "Delta (m)" DOUBLE PRECISION,
  "Valve Type (register)" TEXT,
  "Valve Type (IFC)" TEXT,
  "Drawing (register)" TEXT,
  "Drawing (IFC, proposed)" TEXT,
  "Discrepancy" TEXT,
  "Recommended Action" TEXT
);


CREATE TABLE IF NOT EXISTS tblSetting (
  "Setting" TEXT PRIMARY KEY,
  "Value" TEXT,
  "What it does" TEXT
);


CREATE TABLE IF NOT EXISTS tblStandingResource (
  _id BIGSERIAL PRIMARY KEY,
  "Type" TEXT,
  "Description" TEXT,
  "Number" INTEGER,
  "Default Hours" INTEGER,
  "Notes" TEXT
);


CREATE TABLE IF NOT EXISTS tblDocControl (
  "Item" TEXT PRIMARY KEY,
  "Value" TEXT
);


CREATE TABLE IF NOT EXISTS tblSrcThrustBlock (
  _id BIGSERIAL PRIMARY KEY,
  "Col2" TEXT,
  "Located" TEXT,
  "C&G" TEXT,
  "TRENCH" DOUBLE PRECISION,
  "Surveyors PtNo" TEXT,
  "E" DOUBLE PRECISION,
  "N" DOUBLE PRECISION,
  "Z" DOUBLE PRECISION,
  "Survey Code" TEXT,
  "Actual Chainage" DOUBLE PRECISION,
  "Asset Id" TEXT,
  "KP" DOUBLE PRECISION,
  "Pipeline Section" TEXT,
  "Utility Type" TEXT,
  "Utility Description" TEXT,
  "Operator" TEXT,
  "Location" TEXT,
  "Material" TEXT,
  "Size (mm)" INTEGER,
  "ID" TEXT,
  "Proven to Underside of Service" TEXT,
  "Test Point" TEXT,
  "C&G Code" TEXT,
  "Trench Code" TEXT,
  "Proposed Crossing Method" TEXT,
  "Parallel or Crossed" TEXT,
  "Design Drawing" TEXT,
  "DBYD SEQ" TEXT,
  "Separation (m) (Minimum 600mm clearance to underside of asse" DOUBLE PRECISION,
  "Asset DOC (m)" DOUBLE PRECISION,
  "Pipeline DOC (m)" DOUBLE PRECISION,
  "Depth to Underside of Asset (m)" DOUBLE PRECISION,
  "Crossover" TEXT,
  "Within" TEXT,
  "Permit to Excavate Near Assets Required?" TEXT,
  "Permit/Notification Date" TEXT,
  "Crossing Permit Required?" TEXT,
  "Permit/Notification Date 2" TEXT,
  "Comments" TEXT,
  "Thrust Block Category" TEXT
);


CREATE TABLE IF NOT EXISTS tblSrcTrenchType (
  _id BIGSERIAL PRIMARY KEY,
  "Located" TEXT,
  "C&G" TEXT,
  "TRENCH" DOUBLE PRECISION,
  "Surveyors PtNo" TEXT,
  "E" DOUBLE PRECISION,
  "N" DOUBLE PRECISION,
  "Z" DOUBLE PRECISION,
  "Survey Code" TEXT,
  "Actual Chainage" DOUBLE PRECISION,
  "Drawing (START)" TEXT,
  "Drawing (END)" TEXT,
  "KP (START)" DOUBLE PRECISION,
  "KP (END)" DOUBLE PRECISION,
  "Trench Type" TEXT,
  "Total Length Sections (m)" DOUBLE PRECISION,
  "Pipeline Section" TEXT,
  "Utility Description" TEXT,
  "Operator" TEXT,
  "Location" TEXT,
  "Material" TEXT,
  "Size (mm)" DOUBLE PRECISION,
  "ID" TEXT,
  "Proven to Underside of Service" TEXT,
  "Test Point" TEXT,
  "C&G Code" TEXT,
  "Trench Code" TEXT,
  "Proposed Crossing Method" TEXT,
  "Parallel or Crossed" TEXT,
  "Design Drawing" TEXT,
  "DBYD SEQ" TEXT,
  "Separation (m) (Minimum 600mm clearance to underside of asse" DOUBLE PRECISION,
  "Asset DOC (m)" DOUBLE PRECISION,
  "Pipeline DOC (m)" DOUBLE PRECISION,
  "Depth to Underside of Asset (m)" DOUBLE PRECISION,
  "Crossover" TEXT,
  "Within" TEXT,
  "Permit to Excavate Near Assets Required?" TEXT,
  "Permit/Notification Date" TEXT,
  "Crossing Permit Required?" TEXT,
  "Permit/Notification Date (2)" TEXT,
  "Comments" TEXT,
  "Trench Type (2)" TEXT,
  "PWG" DOUBLE PRECISION,
  "PHW" DOUBLE PRECISION,
  "Total (m)" DOUBLE PRECISION,
  "No of Sections" INTEGER,
  "Source Row" INTEGER
);


CREATE TABLE IF NOT EXISTS tblSrcTrenchStopBH (
  _id BIGSERIAL PRIMARY KEY,
  "Col2" TEXT,
  "Located" TEXT,
  "C&G" TEXT,
  "TRENCH" DOUBLE PRECISION,
  "Surveyors PtNo" TEXT,
  "E" DOUBLE PRECISION,
  "N" DOUBLE PRECISION,
  "Z" DOUBLE PRECISION,
  "Survey Code" TEXT,
  "Actual Chainage" DOUBLE PRECISION,
  "Col13" TEXT,
  "Asset Id" TEXT,
  "Drawing" TEXT,
  "Pipeline Section" TEXT,
  "KP" DOUBLE PRECISION,
  "Utility Type" TEXT,
  "Notes , Not on Plan" TEXT,
  "Operator" TEXT,
  "Location" TEXT,
  "Material" TEXT,
  "Size (mm)" DOUBLE PRECISION,
  "ID" TEXT,
  "Proven to Underside of Service" TEXT,
  "Test Point" TEXT,
  "C&G Code" TEXT,
  "Trench Code" TEXT,
  "Proposed Crossing Method" TEXT,
  "Parallel or Crossed" TEXT,
  "Design Drawing" TEXT,
  "DBYD SEQ" TEXT,
  "Separation (m) (Minimum 600mm clearance to underside of asse" DOUBLE PRECISION,
  "Asset DOC (m)" DOUBLE PRECISION,
  "Pipeline DOC (m)" DOUBLE PRECISION,
  "Depth to Underside of Asset (m)" DOUBLE PRECISION,
  "Crossover" TEXT,
  "Within" TEXT,
  "Permit to Excavate Near Assets Required?" TEXT,
  "Permit/Notification Date" TEXT
);


CREATE TABLE IF NOT EXISTS tblSrcForeignService (
  _id BIGSERIAL PRIMARY KEY,
  "Asset Id" TEXT,
  "Pipeline Section" TEXT,
  "KP" INTEGER,
  "Utility Description" TEXT,
  "Utility Type" TEXT,
  "Operator" TEXT,
  "Size (mm)" TEXT,
  "Info Source" TEXT,
  "Drawing" TEXT,
  "Drawing (superseded)" TEXT,
  "Included in Current Plan" TEXT,
  "Comments" TEXT,
  "Source Row" INTEGER
);


CREATE TABLE IF NOT EXISTS tblSrcCreekCrossing (
  _id BIGSERIAL PRIMARY KEY,
  "Asset Id" TEXT,
  "Pipeline Section" TEXT,
  "KP (START)" INTEGER,
  "KP (END)" INTEGER,
  "Feature Name" TEXT,
  "Embankment Treatment" TEXT,
  "Creek Bed Treatment" TEXT,
  "Source Row" INTEGER
);


CREATE TABLE IF NOT EXISTS tblSrcRoadRailXing (
  _id BIGSERIAL PRIMARY KEY,
  "Asset Id" TEXT,
  "Pipeline Section" TEXT,
  "KP (START)" DOUBLE PRECISION,
  "KP (END)" DOUBLE PRECISION,
  "Utility Type" TEXT,
  "Surface" TEXT,
  "Pipeline DN" INTEGER,
  "Total Length Sections (m)" DOUBLE PRECISION,
  "Feature Name" TEXT,
  "Operator" TEXT,
  "Proposed Crossing Method" TEXT,
  "Pipe Description" TEXT,
  "Type 6 (m)" DOUBLE PRECISION,
  "Type 7 (m)" DOUBLE PRECISION,
  "Type 4 & 7 (m)" DOUBLE PRECISION,
  "Type 4 & 6 (m)" DOUBLE PRECISION,
  "Source Row" INTEGER
);


CREATE TABLE IF NOT EXISTS tblSrcTreeRemoval (
  _id BIGSERIAL PRIMARY KEY,
  "Pipe ID" TEXT,
  "Pipeline" TEXT,
  "Start Chainage" DOUBLE PRECISION,
  "End Chainage" DOUBLE PRECISION,
  "SC(m)" INTEGER,
  "EC (m)" INTEGER,
  "Area m2" DOUBLE PRECISION,
  "Timber Density HEAVY/LIGHT/TRIM" TEXT,
  "Other Information" TEXT,
  "Loaded to Master Register?" TEXT
);



CREATE INDEX IF NOT EXISTS ix_dailyplant_crew ON tblDailyPlantLabour ("Date", "Pipeline Section", "Crew");

CREATE TABLE IF NOT EXISTS tblCrewTrack (
  section TEXT NOT NULL, crew TEXT NOT NULL, track TEXT NOT NULL,
  active_from DOUBLE PRECISION, current_position DOUBLE PRECISION,
  PRIMARY KEY (section, crew, track)
);
CREATE TABLE IF NOT EXISTS tblCrewSegment (
  id BIGSERIAL PRIMARY KEY,
  section TEXT NOT NULL, crew TEXT NOT NULL, track TEXT NOT NULL,
  from_ch DOUBLE PRECISION NOT NULL, to_ch DOUBLE PRECISION NOT NULL, date_closed TEXT
);
CREATE TABLE IF NOT EXISTS tblCrewDay (
  id BIGSERIAL PRIMARY KEY,
  date TEXT NOT NULL, section TEXT NOT NULL, crew TEXT NOT NULL, track TEXT NOT NULL,
  from_ch DOUBLE PRECISION, to_ch DOUBLE PRECISION, metres DOUBLE PRECISION,
  kind TEXT, recorded_by TEXT
);
CREATE INDEX IF NOT EXISTS ix_crewday_date ON tblCrewDay (date);

CREATE TABLE IF NOT EXISTS app_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('admin','editor','viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_sessions (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_user_sessions_expire ON user_sessions (expire);
CREATE TABLE IF NOT EXISTS app_admin_audit (
  id BIGSERIAL PRIMARY KEY,
  happened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  username TEXT,
  action TEXT NOT NULL,
  details JSONB
);
CREATE TABLE IF NOT EXISTS app_baseline_asset_progress AS
SELECT "Record Key", "Complete", "Completion Date", "Progress Notes", "Installed",
       "Install Date", "Installed By", "Auto Complete", "Auto Complete As At"
FROM tblAsset WITH NO DATA;
CREATE UNIQUE INDEX IF NOT EXISTS ux_baseline_asset_progress_key ON app_baseline_asset_progress ("Record Key");
CREATE TABLE IF NOT EXISTS app_baseline_progress_control AS SELECT * FROM tblProgressControl WITH NO DATA;
CREATE TABLE IF NOT EXISTS app_baseline_trench_progress AS SELECT * FROM tblTrenchProgress WITH NO DATA;
CREATE TABLE IF NOT EXISTS app_baseline_edit_log AS SELECT * FROM tblEditLog WITH NO DATA;

REVOKE ALL ON TABLE tblAsset FROM anon, authenticated;
REVOKE ALL ON TABLE tblRateTrench FROM anon, authenticated;
REVOKE ALL ON TABLE tblRatePipe FROM anon, authenticated;
REVOKE ALL ON TABLE tblRatePoint FROM anon, authenticated;
REVOKE ALL ON TABLE tblRateThrustBlock FROM anon, authenticated;
REVOKE ALL ON TABLE tblRateBend FROM anon, authenticated;
REVOKE ALL ON TABLE tblRateValve FROM anon, authenticated;
REVOKE ALL ON TABLE tblRatePlantLabour FROM anon, authenticated;
REVOKE ALL ON TABLE tblProgressControl FROM anon, authenticated;
REVOKE ALL ON TABLE tblTrenchProgress FROM anon, authenticated;
REVOKE ALL ON TABLE tblDailyProgress FROM anon, authenticated;
REVOKE ALL ON TABLE tblDailyPlantLabour FROM anon, authenticated;
REVOKE ALL ON TABLE tblDailySafety FROM anon, authenticated;
REVOKE ALL ON TABLE tblDailyHoldPoint FROM anon, authenticated;
REVOKE ALL ON TABLE tblDailyProfit FROM anon, authenticated;
REVOKE ALL ON TABLE tblEditLog FROM anon, authenticated;
REVOKE ALL ON TABLE tblDataQuality FROM anon, authenticated;
REVOKE ALL ON TABLE tblRevision FROM anon, authenticated;
REVOKE ALL ON TABLE tblValveScheduleReview FROM anon, authenticated;
REVOKE ALL ON TABLE tblSetting FROM anon, authenticated;
REVOKE ALL ON TABLE tblStandingResource FROM anon, authenticated;
REVOKE ALL ON TABLE tblDocControl FROM anon, authenticated;
REVOKE ALL ON TABLE tblSrcThrustBlock FROM anon, authenticated;
REVOKE ALL ON TABLE tblSrcTrenchType FROM anon, authenticated;
REVOKE ALL ON TABLE tblSrcTrenchStopBH FROM anon, authenticated;
REVOKE ALL ON TABLE tblSrcForeignService FROM anon, authenticated;
REVOKE ALL ON TABLE tblSrcCreekCrossing FROM anon, authenticated;
REVOKE ALL ON TABLE tblSrcRoadRailXing FROM anon, authenticated;
REVOKE ALL ON TABLE tblSrcTreeRemoval FROM anon, authenticated;
REVOKE ALL ON TABLE tblCrewTrack FROM anon, authenticated;
REVOKE ALL ON TABLE tblCrewSegment FROM anon, authenticated;
REVOKE ALL ON TABLE tblCrewDay FROM anon, authenticated;
REVOKE ALL ON TABLE app_profiles FROM anon, authenticated;
REVOKE ALL ON TABLE user_sessions FROM anon, authenticated;
REVOKE ALL ON TABLE app_admin_audit FROM anon, authenticated;
REVOKE ALL ON TABLE app_baseline_asset_progress FROM anon, authenticated;
REVOKE ALL ON TABLE app_baseline_progress_control FROM anon, authenticated;
REVOKE ALL ON TABLE app_baseline_trench_progress FROM anon, authenticated;
REVOKE ALL ON TABLE app_baseline_edit_log FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
