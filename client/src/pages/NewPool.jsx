import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Plus, Waves, X } from "lucide-react";
import api, { getErrorMessage } from "../services/api";
import { useAuth, useToast } from "../context";
import { PageHeading } from "../components/common";

const FACILITY_ID = "bluewater-farms";
const FACILITY_NAME = "Bluewater Farms";
const SPECIES_OPTIONS = [
  "Rohu", "Catla", "Tilapia", "Common Carp", "Grass Carp", "Silver Carp", "Mrigal", "Other",
];
const POOL_TYPES = [
  "Circular", "Rectangular", "Raceway", "Tank", "Pond", "Aquaculture Cage", "Other",
];
const initialForm = () => ({
  pool_code: "",
  name: "",
  pool_type: "Rectangular",
  facility_id: FACILITY_ID,
  dimensions: { length: "", width: "", depth: "", unit: "meters" },
  water_capacity: { value: "", unit: "liters" },
  water_parameters: {
    water_type: "Freshwater",
    temperature: { min: "", max: "" },
    ph: { min: "", max: "" },
    dissolved_oxygen: { min: "", max: "" },
  },
  fish_stock: {
    species: [],
    initial_count: "",
    current_count: "",
    stocking_date: "",
    initial_average_weight: "",
    initial_average_weight_unit: "grams",
  },
  monitoring: {
    enabled: true,
    camera_available: false,
    camera_type: "IP Camera",
    camera_position: "Top View",
  },
  ai_configuration: {
    fish_detection: true,
    species_detection: true,
    disease_detection: true,
    size_estimation: true,
    weight_estimation: true,
  },
  alerts: {
    health_enabled: true,
    disease_threshold: "",
    mortality_threshold: "",
    population_change_threshold: "",
  },
  farming: {
    purpose: "Grow-out",
    stocking_density: "",
    feeding_schedule: "",
  },
  location_details: { name: "", latitude: "", longitude: "" },
  notes: "",
  camera_id: "",
});

function PoolField({ label, required, error, help, children, className = "" }) {
  return (
    <label className={`pool-form-field ${className}`}>
      <span className="pool-form-label">
        {label}{required && <i aria-hidden="true"> *</i>}
      </span>
      {children}
      {help && <small className="pool-field-help">{help}</small>}
      {error && <small className="pool-field-error" role="alert">{error}</small>}
    </label>
  );
}

function PoolSection({ number, title, description, children }) {
  return (
    <section className="new-pool-section">
      <div className="new-pool-section-heading">
        <span>{number}</span>
        <div><h2>{title}</h2><p>{description}</p></div>
      </div>
      <div className="new-pool-section-content">{children}</div>
    </section>
  );
}

function ToggleField({ label, description, checked, onChange }) {
  return (
    <label className="pool-toggle">
      <span><b>{label}</b><small>{description}</small></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

function RangeFields({ label, value, onChange, unit, errorMin, errorMax, min, max, step = "any" }) {
  return (
    <div className="pool-range">
      <span className="pool-range-title">{label}<small>{unit}</small></span>
      <div className="pool-range-fields">
        <PoolField label="Minimum" error={errorMin}>
          <input type="number" min={min} max={max} step={step} value={value.min} onChange={(event) => onChange("min", event.target.value)} />
        </PoolField>
        <PoolField label="Maximum" error={errorMax}>
          <input type="number" min={min} max={max} step={step} value={value.max} onChange={(event) => onChange("max", event.target.value)} />
        </PoolField>
      </div>
    </div>
  );
}

const numberOrNull = (value) => value === "" || value == null ? null : Number(value);

function estimateCapacityLiters(form) {
  const { length, width, depth, unit } = form.dimensions;
  if (form.pool_type !== "Rectangular" || !length || !width || !depth) return null;
  const cubicMeters = Number(length) * Number(width) * Number(depth) * (unit === "feet" ? 0.0283168466 : 1);
  return Math.round(cubicMeters * 1000);
}

export default function NewPool() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [pools, setPools] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [lookupWarning, setLookupWarning] = useState("");
  const [speciesDraft, setSpeciesDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user && user.role !== "admin") navigate("/pools", { replace: true });
  }, [navigate, user]);

  useEffect(() => {
    let active = true;
    Promise.allSettled([api.get("/pools"), api.get("/cameras")]).then(([poolResult, cameraResult]) => {
      if (!active) return;
      if (poolResult.status === "fulfilled") {
        const rows = Array.isArray(poolResult.value.data) ? poolResult.value.data : [];
        setPools(rows);
      } else {
        setLookupWarning("Existing pool codes could not be loaded. The server will still check uniqueness when you save.");
      }
      if (cameraResult.status === "fulfilled" && Array.isArray(cameraResult.value.data)) {
        setCameras(cameraResult.value.data);
      }
    });
    return () => { active = false; };
  }, []);

  const estimatedCapacity = useMemo(() => estimateCapacityLiters(form), [form]);
  const duplicateCode = useMemo(() => {
    const code = form.pool_code.trim().toUpperCase();
    return code && pools.some((pool) => (
      (pool.facility_id || FACILITY_ID) === form.facility_id
      && String(pool.pool_code || pool.id || pool.pool_id || "").toUpperCase() === code
    ));
  }, [form.facility_id, form.pool_code, pools]);

  const setRoot = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const setSection = (section, key, value) => setForm((current) => ({
    ...current,
    [section]: { ...current[section], [key]: value },
  }));
  const setRange = (key, part, value) => setForm((current) => ({
    ...current,
    water_parameters: {
      ...current.water_parameters,
      [key]: { ...current.water_parameters[key], [part]: value },
    },
  }));

  const validate = () => {
    const next = {};
    const code = form.pool_code.trim().toUpperCase();
    if (!form.name.trim() || form.name.trim().length < 2) next.name = "Enter a pool name with at least 2 characters.";
    if (!code) next.pool_code = "Pool code is required.";
    else if (!/^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(code)) next.pool_code = "Use letters, numbers, hyphens, or underscores.";
    else if (duplicateCode) next.pool_code = `Pool code ${code} already exists in this facility.`;

    const dimensions = form.dimensions;
    const dimensionValues = [dimensions.length, dimensions.width, dimensions.depth];
    const enteredDimensions = dimensionValues.filter((value) => value !== "").length;
    if (enteredDimensions > 0 && enteredDimensions < 3) {
      next.dimensions = "Enter length, width, and depth, or leave all three blank.";
    }
    for (const [section, ranges] of Object.entries({
      temperature: form.water_parameters.temperature,
      ph: form.water_parameters.ph,
      dissolved_oxygen: form.water_parameters.dissolved_oxygen,
    })) {
      if (ranges.min !== "" && ranges.max !== "" && Number(ranges.min) > Number(ranges.max)) {
        next[`${section}_min`] = `Minimum ${section === "ph" ? "pH" : section.replaceAll("_", " ")} cannot exceed its maximum.`;
      }
    }
    const latitude = form.location_details.latitude;
    const longitude = form.location_details.longitude;
    if ((latitude === "") !== (longitude === "")) next.coordinates = "Enter both latitude and longitude, or leave both blank.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const addSpecies = () => {
    const item = speciesDraft.trim();
    if (!item) return;
    if (!form.fish_stock.species.some((species) => species.toLowerCase() === item.toLowerCase())) {
      setSection("fish_stock", "species", [...form.fish_stock.species, item]);
    }
    setSpeciesDraft("");
  };

  const validateCode = () => {
    const code = form.pool_code.trim().toUpperCase();
    let message = "";
    if (!code) message = "Pool code is required.";
    else if (!/^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(code)) message = "Use letters, numbers, hyphens, or underscores.";
    else if (duplicateCode) message = `Pool code ${code} already exists in this facility.`;
    setErrors((current) => ({ ...current, pool_code: message }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy || !validate()) return;
    setBusy(true);
    const capacityValue = numberOrNull(form.water_capacity.value);
    const capacityLiters = capacityValue == null
      ? null
      : Math.round(capacityValue * (form.water_capacity.unit === "cubic_meters" ? 1000 : 1));
    const currentCount = numberOrNull(form.fish_stock.current_count);
    const species = form.fish_stock.species;
    const body = {
      pool_code: form.pool_code.trim().toUpperCase(),
      pool_id: form.pool_code.trim().toUpperCase(),
      facility_id: form.facility_id,
      name: form.name.trim(),
      location: form.location_details.name.trim(),
      location_details: {
        name: form.location_details.name.trim() || null,
        latitude: numberOrNull(form.location_details.latitude),
        longitude: numberOrNull(form.location_details.longitude),
      },
      pool_type: form.pool_type,
      dimensions: {
        length: numberOrNull(form.dimensions.length),
        width: numberOrNull(form.dimensions.width),
        depth: numberOrNull(form.dimensions.depth),
        unit: form.dimensions.unit,
      },
      water_capacity: { value: capacityValue, unit: form.water_capacity.unit },
      capacity_l: capacityLiters,
      water_parameters: {
        water_type: form.water_parameters.water_type,
        temperature: {
          min: numberOrNull(form.water_parameters.temperature.min),
          max: numberOrNull(form.water_parameters.temperature.max),
        },
        ph: {
          min: numberOrNull(form.water_parameters.ph.min),
          max: numberOrNull(form.water_parameters.ph.max),
        },
        dissolved_oxygen: {
          min: numberOrNull(form.water_parameters.dissolved_oxygen.min),
          max: numberOrNull(form.water_parameters.dissolved_oxygen.max),
        },
      },
      species: species.length ? species.join(", ") : "Unspecified",
      fish_stock: {
        ...form.fish_stock,
        initial_count: numberOrNull(form.fish_stock.initial_count),
        current_count: currentCount,
        stocking_date: form.fish_stock.stocking_date || null,
        initial_average_weight: numberOrNull(form.fish_stock.initial_average_weight),
      },
      fish_count: currentCount,
      monitoring: form.monitoring,
      ai_configuration: form.ai_configuration,
      alerts: {
        ...form.alerts,
        disease_threshold: numberOrNull(form.alerts.disease_threshold),
        mortality_threshold: numberOrNull(form.alerts.mortality_threshold),
        population_change_threshold: numberOrNull(form.alerts.population_change_threshold),
      },
      farming: {
        ...form.farming,
        stocking_density: numberOrNull(form.farming.stocking_density),
      },
      camera_id: form.monitoring.camera_available ? form.camera_id || null : null,
      notes: form.notes.trim(),
      description: form.notes.trim().slice(0, 500),
      status: "active",
    };
    try {
      const { data } = await api.post("/pools", body);
      const createdCode = data.pool_code || data.id || body.pool_code;
      toast.success(`Pool ${createdCode} created successfully.`);
      navigate(`/pools/${encodeURIComponent(data.id || data.pool_id || createdCode)}`);
    } catch (error) {
      const message = getErrorMessage(error, "Unable to create pool. Please check the server connection.");
      if (error?.response?.status === 409) {
        setErrors((current) => ({ ...current, pool_code: message }));
      } else {
        toast.error(message);
      }
    } finally {
      setBusy(false);
    }
  };

  if (!user || user.role !== "admin") return null;

  const capacityEstimateInSelectedUnit = estimatedCapacity == null
    ? null
    : form.water_capacity.unit === "cubic_meters"
      ? (estimatedCapacity / 1000).toFixed(2)
      : String(estimatedCapacity);

  return (
    <div className="new-pool-page">
      <PageHeading
        eyebrow="PRODUCTION ASSETS"
        title="Add a new pool"
        description="Record the pool setup and monitoring configuration. Optional measurements stay blank until you have real values."
        action={<button type="button" className="btn-secondary" onClick={() => navigate("/pools")}><ArrowLeft size={14} /> Back to pools</button>}
      />
      <form className="new-pool-form" onSubmit={submit}>
        <div className="new-pool-form-intro">
          <span className="new-pool-mark"><Waves size={18} /></span>
          <div><strong>Pool setup</strong><span>Required fields are marked with an asterisk.</span></div>
        </div>
        {lookupWarning && <div className="pool-form-warning" role="status">{lookupWarning}</div>}

        <PoolSection number="01" title="Basic information" description="Identify this pool within the current farm workspace.">
          <div className="pool-form-grid">
            <PoolField label="Pool name" required error={errors.name}>
              <input required minLength="2" value={form.name} onChange={(event) => setRoot("name", event.target.value)} placeholder="Main growth pool" aria-invalid={!!errors.name} />
            </PoolField>
            <PoolField label="Pool code / ID" required error={errors.pool_code} help="Must be unique in this facility.">
              <input required maxLength="32" value={form.pool_code} onChange={(event) => { setRoot("pool_code", event.target.value.toUpperCase()); setErrors((current) => ({ ...current, pool_code: "" })); }} onBlur={validateCode} placeholder="P001" aria-invalid={!!errors.pool_code} />
            </PoolField>
            <PoolField label="Facility" required help="This workspace currently has one facility; it is selected automatically.">
              <select value={form.facility_id} disabled aria-label="Facility">
                <option value={FACILITY_ID}>{FACILITY_NAME} · current workspace</option>
              </select>
            </PoolField>
            <PoolField label="Pool type" required>
              <select value={form.pool_type} onChange={(event) => setRoot("pool_type", event.target.value)}>
                {POOL_TYPES.map((type) => <option key={type}>{type}</option>)}
              </select>
            </PoolField>
          </div>
        </PoolSection>

        <PoolSection number="02" title="Physical specifications" description="Record dimensions and capacity only when known.">
          <div className="pool-form-grid pool-form-grid-4">
            <PoolField label="Length"><input type="number" min="0.01" step="any" value={form.dimensions.length} onChange={(event) => setSection("dimensions", "length", event.target.value)} placeholder="—" /></PoolField>
            <PoolField label="Width"><input type="number" min="0.01" step="any" value={form.dimensions.width} onChange={(event) => setSection("dimensions", "width", event.target.value)} placeholder="—" /></PoolField>
            <PoolField label="Depth"><input type="number" min="0.01" step="any" value={form.dimensions.depth} onChange={(event) => setSection("dimensions", "depth", event.target.value)} placeholder="—" /></PoolField>
            <PoolField label="Dimension unit"><select value={form.dimensions.unit} onChange={(event) => setSection("dimensions", "unit", event.target.value)}><option value="meters">Meters</option><option value="feet">Feet</option></select></PoolField>
          </div>
          {errors.dimensions && <div className="pool-field-error pool-form-full-error" role="alert">{errors.dimensions}</div>}
          <div className="pool-capacity-row">
            <PoolField label="Water capacity">
              <input type="number" min="0" step="any" value={form.water_capacity.value} onChange={(event) => setSection("water_capacity", "value", event.target.value)} placeholder="Enter a measured or confirmed capacity" />
            </PoolField>
            <PoolField label="Capacity unit">
              <select value={form.water_capacity.unit} onChange={(event) => setSection("water_capacity", "unit", event.target.value)}><option value="liters">Liters</option><option value="cubic_meters">Cubic meters</option></select>
            </PoolField>
          </div>
          {capacityEstimateInSelectedUnit != null && <div className="capacity-estimate"><span>Estimated capacity: <b>{capacityEstimateInSelectedUnit} {form.water_capacity.unit === "liters" ? "L" : "m³"}</b></span><button type="button" className="btn-quiet compact-quiet" onClick={() => setSection("water_capacity", "value", capacityEstimateInSelectedUnit)}>Use estimate</button><small>Estimate from dimensions; confirm or edit before saving.</small></div>}
        </PoolSection>

        <PoolSection number="03" title="Water parameters" description="These are target ranges, not sensor readings.">
          <div className="pool-form-grid">
            <PoolField label="Water type"><select value={form.water_parameters.water_type} onChange={(event) => setSection("water_parameters", "water_type", event.target.value)}><option>Freshwater</option><option>Brackish Water</option><option>Saltwater</option></select></PoolField>
            <div />
            <RangeFields label="Temperature range" unit="°C" value={form.water_parameters.temperature} onChange={(part, value) => setRange("temperature", part, value)} errorMin={errors.temperature_min} errorMax={errors.temperature_max} min="-10" max="60" />
            <RangeFields label="Target pH" unit="pH" value={form.water_parameters.ph} onChange={(part, value) => setRange("ph", part, value)} errorMin={errors.ph_min} errorMax={errors.ph_max} min="0" max="14" />
            <RangeFields label="Dissolved oxygen" unit="mg/L" value={form.water_parameters.dissolved_oxygen} onChange={(part, value) => setRange("dissolved_oxygen", part, value)} errorMin={errors.dissolved_oxygen_min} errorMax={errors.dissolved_oxygen_max} min="0" max="100" />
          </div>
        </PoolSection>

        <PoolSection number="04" title="Fish stock information" description="Leave counts or weights blank when there is no measured value.">
          <PoolField label="Primary species" help="Search a species name, then add one or more species.">
            <div className="species-entry">
              <input list="pool-species-options" value={speciesDraft} onChange={(event) => setSpeciesDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addSpecies(); } }} placeholder="Search or enter a species" />
              <datalist id="pool-species-options">{SPECIES_OPTIONS.map((species) => <option key={species} value={species} />)}</datalist>
              <button type="button" className="btn-secondary compact" onClick={addSpecies}><Plus size={13} /> Add species</button>
            </div>
            {!!form.fish_stock.species.length && <div className="species-chips">{form.fish_stock.species.map((species) => <span key={species}>{species}<button type="button" aria-label={`Remove ${species}`} onClick={() => setSection("fish_stock", "species", form.fish_stock.species.filter((item) => item !== species))}><X size={12} /></button></span>)}</div>}
          </PoolField>
          <div className="pool-form-grid">
            <PoolField label="Initial fish count"><input type="number" min="0" step="1" value={form.fish_stock.initial_count} onChange={(event) => setSection("fish_stock", "initial_count", event.target.value)} placeholder="Not recorded" /></PoolField>
            <PoolField label="Current estimated fish count" help="User-entered estimate; AI detection can update it later."><input type="number" min="0" step="1" value={form.fish_stock.current_count} onChange={(event) => setSection("fish_stock", "current_count", event.target.value)} placeholder="Not recorded" /></PoolField>
            <PoolField label="Stocking date"><input type="date" value={form.fish_stock.stocking_date} onChange={(event) => setSection("fish_stock", "stocking_date", event.target.value)} /></PoolField>
            <PoolField label="Initial average fish weight"><input type="number" min="0" step="any" value={form.fish_stock.initial_average_weight} onChange={(event) => setSection("fish_stock", "initial_average_weight", event.target.value)} placeholder="Not recorded" /></PoolField>
            <PoolField label="Weight unit"><select value={form.fish_stock.initial_average_weight_unit} onChange={(event) => setSection("fish_stock", "initial_average_weight_unit", event.target.value)}><option value="grams">Grams</option><option value="kg">Kilograms</option></select></PoolField>
          </div>
        </PoolSection>

        <PoolSection number="05" title="Monitoring configuration" description="Link an existing camera; pool creation does not create camera records.">
          <div className="pool-toggle-grid">
            <ToggleField label="Monitoring enabled" description="Allow monitoring workflows for this pool." checked={form.monitoring.enabled} onChange={(value) => setSection("monitoring", "enabled", value)} />
            <ToggleField label="Camera available" description="Enable the camera settings below." checked={form.monitoring.camera_available} onChange={(value) => setSection("monitoring", "camera_available", value)} />
          </div>
          <div className="pool-form-grid">
            <PoolField label="Camera type"><select value={form.monitoring.camera_type} onChange={(event) => setSection("monitoring", "camera_type", event.target.value)}><option>IP Camera</option><option>USB Camera</option><option>RTSP Camera</option><option>Webcam</option><option>Other</option></select></PoolField>
            <PoolField label="Existing camera">
              <select value={form.camera_id} disabled={!form.monitoring.camera_available} onChange={(event) => setRoot("camera_id", event.target.value)}>
                <option value="">No camera configured</option>
                {cameras.map((camera) => <option key={camera.id} value={camera.id}>{camera.id} · {camera.name}</option>)}
              </select>
            </PoolField>
            <PoolField label="Camera position"><select value={form.monitoring.camera_position} onChange={(event) => setSection("monitoring", "camera_position", event.target.value)}><option>Top View</option><option>Side View</option><option>Underwater</option><option>Entrance</option><option>Exit</option><option>Other</option></select></PoolField>
          </div>
        </PoolSection>

        <PoolSection number="06" title="AI monitoring configuration" description="Settings control which analysis results are available for this pool.">
          <div className="pool-toggle-grid">
            <ToggleField label="Fish detection" description="Object detection and counting." checked={form.ai_configuration.fish_detection} onChange={(value) => setSection("ai_configuration", "fish_detection", value)} />
            <ToggleField label="Species detection" description="Species classification." checked={form.ai_configuration.species_detection} onChange={(value) => setSection("ai_configuration", "species_detection", value)} />
            <ToggleField label="Disease detection" description="Preliminary health screening." checked={form.ai_configuration.disease_detection} onChange={(value) => setSection("ai_configuration", "disease_detection", value)} />
            <ToggleField label="Size estimation" description="Requires a detector and camera calibration." checked={form.ai_configuration.size_estimation} onChange={(value) => setSection("ai_configuration", "size_estimation", value)} />
            <ToggleField label="Weight estimation" description="Requires a validated measurement model." checked={form.ai_configuration.weight_estimation} onChange={(value) => setSection("ai_configuration", "weight_estimation", value)} />
          </div>
          <div className="pool-config-note">Enabling a module does not mean its model is installed. The analysis page will report unavailable models rather than invent results.</div>
        </PoolSection>

        <PoolSection number="07" title="Alerts and farming" description="Optional thresholds and operating details for future monitoring.">
          <ToggleField label="Health alerts enabled" description="Configuration only; no alerts are created during pool setup." checked={form.alerts.health_enabled} onChange={(value) => setSection("alerts", "health_enabled", value)} />
          <div className="pool-form-grid pool-form-grid-3">
            <PoolField label="Disease alert threshold (%)"><input type="number" min="0" max="100" step="any" value={form.alerts.disease_threshold} onChange={(event) => setSection("alerts", "disease_threshold", event.target.value)} placeholder="Not set" /></PoolField>
            <PoolField label="Mortality threshold (%)"><input type="number" min="0" max="100" step="any" value={form.alerts.mortality_threshold} onChange={(event) => setSection("alerts", "mortality_threshold", event.target.value)} placeholder="Not set" /></PoolField>
            <PoolField label="Population change threshold (%)"><input type="number" min="0" max="100" step="any" value={form.alerts.population_change_threshold} onChange={(event) => setSection("alerts", "population_change_threshold", event.target.value)} placeholder="Not set" /></PoolField>
            <PoolField label="Farming purpose"><select value={form.farming.purpose} onChange={(event) => setSection("farming", "purpose", event.target.value)}>{["Grow-out", "Nursery", "Breeding", "Quarantine", "Treatment", "Research", "Mixed", "Other"].map((purpose) => <option key={purpose}>{purpose}</option>)}</select></PoolField>
            <PoolField label="Stocking density (fish/m³)"><input type="number" min="0" step="any" value={form.farming.stocking_density} onChange={(event) => setSection("farming", "stocking_density", event.target.value)} placeholder="Not recorded" /></PoolField>
            <PoolField label="Feeding schedule"><input maxLength="200" value={form.farming.feeding_schedule || ""} onChange={(event) => setSection("farming", "feeding_schedule", event.target.value)} placeholder="Morning + evening" /></PoolField>
          </div>
        </PoolSection>

        <PoolSection number="08" title="Location and notes" description="Location coordinates and notes are optional.">
          <div className="pool-form-grid">
            <PoolField label="Pool location"><input maxLength="120" value={form.location_details.name} onChange={(event) => setSection("location_details", "name", event.target.value)} placeholder="North block" /></PoolField>
            <div />
            <PoolField label="Latitude" error={errors.coordinates}><input type="number" min="-90" max="90" step="any" value={form.location_details.latitude} onChange={(event) => setSection("location_details", "latitude", event.target.value)} placeholder="Optional" /></PoolField>
            <PoolField label="Longitude" error={errors.coordinates}><input type="number" min="-180" max="180" step="any" value={form.location_details.longitude} onChange={(event) => setSection("location_details", "longitude", event.target.value)} placeholder="Optional" /></PoolField>
          </div>
          <PoolField label="Notes"><textarea rows="3" maxLength="2000" value={form.notes} onChange={(event) => setRoot("notes", event.target.value)} placeholder="Operational notes, access details, or context for the farm team." /></PoolField>
        </PoolSection>

        <div className="new-pool-actions">
          <button type="button" className="btn-secondary" onClick={() => navigate("/pools")}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? <><span className="spinner-border spinner-border-sm" aria-hidden="true" /> Saving…</> : <><Check size={15} /> Create pool</>}
          </button>
        </div>
      </form>
    </div>
  );
}
