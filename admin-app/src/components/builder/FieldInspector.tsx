import { useMemo, useState } from 'react';
import type {
  VxfFieldDefinitionMeta,
  VxfFieldSettingDescriptor,
  VxfFieldSettingOption,
} from '../../types/globals';
import type { FormFieldSchema, FormSchemaData } from '../../types/schema';

interface FieldInspectorProps {
  schema: FormSchemaData;
  selectedFieldId: string | null;
  fieldDefinitions?: VxfFieldDefinitionMeta[];
  onUpdateField?: (fieldId: string, updates: Record<string, unknown>) => void;
}

const GROUP_LABELS: Record<string, string> = {
  general: 'General Settings',
  layout: 'Layout',
  validation: 'Validation',
  advanced: 'Advanced',
};

function findSelectedField(
  schema: FormSchemaData,
  fieldId: string | null
): { field: FormFieldSchema; stepTitle: string } | null {
  if (!fieldId) {
    return null;
  }

  for (const step of schema.steps) {
    const match = step.fields.find((f) => f.id === fieldId);
    if (match) {
      return { field: match, stepTitle: step.title };
    }
  }

  return null;
}

function normalizeBooleanValue(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
    return fallback;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '') {
      return false;
    }
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
      return false;
    }
    return fallback;
  }

  return fallback;
}

function normalizeOptionList(raw: unknown): VxfFieldSettingOption[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      label: typeof item.label === 'string' ? item.label : '',
      value: typeof item.value === 'string' ? item.value : '',
    }));
}

interface OptionsEditorControlProps {
  options: VxfFieldSettingOption[];
  maxItems?: number;
  disabled: boolean;
  onChange: (nextOptions: VxfFieldSettingOption[]) => void;
}

function OptionsEditorControl({
  options,
  maxItems = 200,
  disabled,
  onChange,
}: OptionsEditorControlProps) {
  const effectiveMax = typeof maxItems === 'number' && maxItems > 0 ? maxItems : 200;

  const handleOptionChange = (
    index: number,
    prop: 'label' | 'value',
    nextVal: string
  ) => {
    const updated = options.map((opt, idx) =>
      idx === index ? { ...opt, [prop]: nextVal } : opt
    );
    onChange(updated);
  };

  const handleAddOption = () => {
    if (options.length >= effectiveMax) {
      return;
    }
    const nextNum = options.length + 1;
    onChange([
      ...options,
      {
        label: `Option ${nextNum}`,
        value: `option_${nextNum}`,
      },
    ]);
  };

  const handleRemoveOption = (index: number) => {
    onChange(options.filter((_, idx) => idx !== index));
  };

  return (
    <div className="vxf-inspector-options">
      {options.length === 0 ? (
        <p className="vxf-inspector-help">No choices configured. Click &ldquo;+ Add Choice&rdquo; below.</p>
      ) : (
        <div className="vxf-inspector-options__list">
          {options.map((opt, idx) => (
            <div key={idx} className="vxf-inspector-options__row">
              <input
                type="text"
                className="vxf-input"
                aria-label={`Choice ${idx + 1} label`}
                placeholder="Label"
                value={opt.label}
                disabled={disabled}
                onChange={(e) => handleOptionChange(idx, 'label', e.target.value)}
              />
              <input
                type="text"
                className="vxf-input"
                aria-label={`Choice ${idx + 1} value`}
                placeholder="Value"
                value={opt.value}
                disabled={disabled}
                onChange={(e) => handleOptionChange(idx, 'value', e.target.value)}
              />
              <button
                type="button"
                className="button button-small vxf-inspector-options__remove"
                aria-label={`Remove choice ${idx + 1}`}
                disabled={disabled}
                onClick={() => handleRemoveOption(idx)}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className="button button-small"
        disabled={disabled || options.length >= effectiveMax}
        onClick={handleAddOption}
      >
        + Add Choice
      </button>
    </div>
  );
}

interface NumberSettingControlProps {
  inputId: string;
  descriptor: VxfFieldSettingDescriptor;
  currentValue: unknown;
  disabled: boolean;
  onUpdate: (key: string, value: unknown) => void;
}

function NumberSettingControl({
  inputId,
  descriptor,
  currentValue,
  disabled,
  onUpdate,
}: NumberSettingControlProps) {
  const defaultNum =
    typeof descriptor.default === 'number' && Number.isFinite(descriptor.default)
      ? descriptor.default
      : 0;

  const hasValidCurrent = typeof currentValue === 'number' && Number.isFinite(currentValue);
  const displayNumeric = hasValidCurrent ? currentValue : defaultNum;

  const [draftText, setDraftText] = useState<string | null>(null);

  const clampBound = (num: number): number => {
    let next = num;
    if (typeof descriptor.min === 'number' && Number.isFinite(descriptor.min)) {
      next = Math.max(descriptor.min, next);
    }
    if (typeof descriptor.max === 'number' && Number.isFinite(descriptor.max)) {
      next = Math.min(descriptor.max, next);
    }
    return next;
  };

  const parseNumberInput = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed === '-' || trimmed === '.' || trimmed === '-.') {
      return null;
    }
    const parsed =
      descriptor.sanitize === 'int_range'
        ? Number.parseInt(trimmed, 10)
        : Number(trimmed);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return descriptor.sanitize === 'int_range' ? Math.trunc(parsed) : parsed;
  };

  return (
    <div className="vxf-field-group">
      <label htmlFor={inputId} className="vxf-label">
        {descriptor.label}
      </label>
      <input
        id={inputId}
        type="number"
        step={descriptor.sanitize === 'int_range' ? 1 : 'any'}
        className="vxf-input"
        value={draftText !== null ? draftText : String(displayNumeric)}
        min={typeof descriptor.min === 'number' ? descriptor.min : undefined}
        max={typeof descriptor.max === 'number' ? descriptor.max : undefined}
        disabled={disabled}
        onChange={(e) => {
          const nextRaw = e.target.value;
          setDraftText(nextRaw);
          const parsed = parseNumberInput(nextRaw);
          if (parsed !== null) {
            onUpdate(descriptor.key, clampBound(parsed));
          }
        }}
        onBlur={() => {
          if (draftText === null) {
            return;
          }
          const parsed = parseNumberInput(draftText);
          setDraftText(null);
          if (parsed !== null) {
            onUpdate(descriptor.key, clampBound(parsed));
          } else if (currentValue !== undefined) {
            onUpdate(descriptor.key, clampBound(defaultNum));
          }
        }}
      />
      {descriptor.help && <p className="vxf-inspector-help">{descriptor.help}</p>}
    </div>
  );
}

interface DynamicSettingControlProps {
  field: FormFieldSchema;
  descriptor: VxfFieldSettingDescriptor;
  disabled: boolean;
  onUpdate: (key: string, value: unknown) => void;
}

function DynamicSettingControl({
  field,
  descriptor,
  disabled,
  onUpdate,
}: DynamicSettingControlProps) {
  const inputId = `vxf-setting-${field.id}-${descriptor.key}`;
  const currentValue =
    field[descriptor.key] !== undefined ? field[descriptor.key] : descriptor.default;

  const settingType = (descriptor.type || 'text').toLowerCase();

  if (settingType === 'toggle' || settingType === 'boolean') {
    const fallbackBool = normalizeBooleanValue(descriptor.default, false);
    const checked = normalizeBooleanValue(currentValue, fallbackBool);
    return (
      <div className="vxf-field-group">
        <label htmlFor={inputId} className="vxf-inspector-toggle">
          <input
            id={inputId}
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onUpdate(descriptor.key, e.target.checked)}
          />
          <span>{descriptor.label}</span>
        </label>
        {descriptor.help && <p className="vxf-inspector-help">{descriptor.help}</p>}
      </div>
    );
  }

  if (settingType === 'textarea') {
    const textValue = typeof currentValue === 'string' ? currentValue : '';
    return (
      <div className="vxf-field-group">
        <label htmlFor={inputId} className="vxf-label">
          {descriptor.label}
        </label>
        <textarea
          id={inputId}
          className="vxf-textarea"
          rows={3}
          placeholder={descriptor.placeholder ?? ''}
          value={textValue}
          disabled={disabled}
          onChange={(e) => onUpdate(descriptor.key, e.target.value)}
        />
        {descriptor.help && <p className="vxf-inspector-help">{descriptor.help}</p>}
      </div>
    );
  }

  if (settingType === 'number') {
    return (
      <NumberSettingControl
        key={`${field.id}-${descriptor.key}`}
        inputId={inputId}
        descriptor={descriptor}
        currentValue={currentValue}
        disabled={disabled}
        onUpdate={onUpdate}
      />
    );
  }

  if (settingType === 'select') {
    const options = Array.isArray(descriptor.options) ? descriptor.options : [];
    const selectedVal =
      typeof currentValue === 'string' || typeof currentValue === 'number'
        ? String(currentValue)
        : typeof descriptor.default === 'string'
          ? descriptor.default
          : '';

    return (
      <div className="vxf-field-group">
        <label htmlFor={inputId} className="vxf-label">
          {descriptor.label}
        </label>
        <select
          id={inputId}
          className="vxf-select"
          value={selectedVal}
          disabled={disabled}
          onChange={(e) => onUpdate(descriptor.key, e.target.value)}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {descriptor.help && <p className="vxf-inspector-help">{descriptor.help}</p>}
      </div>
    );
  }

  if (settingType === 'options_editor') {
    const options = normalizeOptionList(currentValue);
    return (
      <div className="vxf-field-group">
        <span className="vxf-label">{descriptor.label}</span>
        <OptionsEditorControl
          options={options}
          maxItems={descriptor.maxItems}
          disabled={disabled}
          onChange={(nextOptions) => onUpdate(descriptor.key, nextOptions)}
        />
        {descriptor.help && <p className="vxf-inspector-help">{descriptor.help}</p>}
      </div>
    );
  }

  const stringValue =
    typeof currentValue === 'string'
      ? currentValue
      : typeof currentValue === 'number'
        ? String(currentValue)
        : '';

  return (
    <div className="vxf-field-group">
      <label htmlFor={inputId} className="vxf-label">
        {descriptor.label}
      </label>
      <input
        id={inputId}
        type="text"
        className="vxf-input"
        placeholder={descriptor.placeholder ?? ''}
        value={stringValue}
        disabled={disabled}
        onChange={(e) => onUpdate(descriptor.key, e.target.value)}
      />
      {descriptor.help && <p className="vxf-inspector-help">{descriptor.help}</p>}
    </div>
  );
}

export function FieldInspector({
  schema,
  selectedFieldId,
  fieldDefinitions = [],
  onUpdateField,
}: FieldInspectorProps) {
  const selected = findSelectedField(schema, selectedFieldId);

  const definition = useMemo(() => {
    if (!selected) {
      return undefined;
    }
    return fieldDefinitions.find((def) => def.type === selected.field.type);
  }, [fieldDefinitions, selected]);

  const groupedSettings = useMemo(() => {
    const descriptors = Array.isArray(definition?.settingsSchema)
      ? definition.settingsSchema
      : [];
    const map = new Map<string, VxfFieldSettingDescriptor[]>();

    for (const item of descriptors) {
      if (!item || typeof item !== 'object' || typeof item.key !== 'string' || !item.key) {
        continue;
      }
      const groupKey = typeof item.group === 'string' && item.group ? item.group : 'general';
      const list = map.get(groupKey) ?? [];
      list.push(item);
      map.set(groupKey, list);
    }

    return Array.from(map.entries());
  }, [definition]);

  const isReadOnly = typeof onUpdateField !== 'function';

  return (
    <aside className="vxf-builder-sidebar vxf-builder-sidebar--right" aria-label="Field inspector">
      <div className="vxf-builder-sidebar__header">
        <h2 className="vxf-builder-sidebar__title">Inspector</h2>
        <p className="vxf-builder-sidebar__hint">
          {selected ? `Editing ${definition?.label || selected.field.type}` : 'Field settings & metadata'}
        </p>
      </div>

      <div className="vxf-builder-sidebar__content">
        {selected ? (
          <div className="vxf-inspector-panel">
            <div className="vxf-inspector-section">
              <div className="vxf-inspector-section__title">Field Metadata</div>
              <dl className="vxf-inspector-dl">
                <dt>Type</dt>
                <dd>
                  <code>{selected.field.type}</code>
                </dd>
                <dt>Field Key</dt>
                <dd>
                  <code>{selected.field.key}</code>
                </dd>
                <dt>Instance ID</dt>
                <dd>
                  <code>{selected.field.id}</code>
                </dd>
                <dt>Container</dt>
                <dd>{selected.stepTitle}</dd>
              </dl>
              {definition?.description && (
                <p className="vxf-inspector-help">{definition.description}</p>
              )}
            </div>

            {!definition ? (
              <div className="vxf-inspector-placeholder-box">
                <strong>Unregistered Field Type</strong>
                <p>
                  No field definition metadata was found for <code>{selected.field.type}</code>.
                  Existing schema properties are preserved.
                </p>
              </div>
            ) : groupedSettings.length === 0 ? (
              <div className="vxf-inspector-placeholder-box">
                <strong>No Configurable Settings</strong>
                <p>This field type does not expose additional inspector controls.</p>
              </div>
            ) : (
              groupedSettings.map(([groupKey, descriptors]) => (
                <div key={groupKey} className="vxf-inspector-section">
                  <div className="vxf-inspector-section__title">
                    {GROUP_LABELS[groupKey] || groupKey.toUpperCase()}
                  </div>
                  {descriptors.map((descriptor) => (
                    <DynamicSettingControl
                      key={descriptor.key}
                      field={selected.field}
                      descriptor={descriptor}
                      disabled={isReadOnly}
                      onUpdate={(key, value) => {
                        if (onUpdateField) {
                          onUpdateField(selected.field.id, { [key]: value });
                        }
                      }}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="vxf-inspector-placeholder-box">
            <strong>No Field Selected</strong>
            <p>
              Click any field on the canvas to configure its settings, or drag fields from the
              left sidebar to build your form.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
