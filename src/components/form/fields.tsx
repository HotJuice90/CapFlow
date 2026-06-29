import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { tokens } from '@/theme';

// ---------- Field wrapper ----------
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

// ---------- TextField ----------
export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  autoFocus,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  hint?: string;
  autoFocus?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={tokens.text.tertiary}
        autoFocus={autoFocus}
      />
    </Field>
  );
}

// ---------- NumberField ----------
export function NumberField({
  label,
  value,
  onChange,
  placeholder,
  suffix,
  hint,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  suffix?: string;
  hint?: string;
}) {
  const [text, setText] = useState(value !== undefined ? String(value) : '');
  return (
    <Field label={label} hint={hint}>
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, styles.inputFlex]}
          value={text}
          keyboardType="numeric"
          onChangeText={(t) => {
            const norm = t.replace(',', '.').replace(/[^0-9.]/g, '');
            setText(norm);
            const n = parseFloat(norm);
            onChange(Number.isFinite(n) ? n : undefined);
          }}
          placeholder={placeholder}
          placeholderTextColor={tokens.text.tertiary}
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
    </Field>
  );
}

// ---------- DateField (маска ДД.ММ.ГГГГ) ----------
function isoToDisplay(iso: string | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d}.${m}.${y}`;
}

function displayToIso(display: string): string | undefined {
  const digits = display.replace(/\D/g, '');
  if (digits.length !== 8) return undefined;
  const d = digits.slice(0, 2);
  const m = digits.slice(2, 4);
  const y = digits.slice(4, 8);
  const dn = Number(d);
  const mn = Number(m);
  if (dn < 1 || dn > 31 || mn < 1 || mn > 12) return undefined;
  return `${y}-${m}-${d}`;
}

function maskDate(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  const parts: string[] = [];
  if (digits.length > 0) parts.push(digits.slice(0, 2));
  if (digits.length >= 3) parts.push(digits.slice(2, 4));
  if (digits.length >= 5) parts.push(digits.slice(4, 8));
  return parts.join('.');
}

export function DateField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string | undefined;
  onChange: (iso: string | undefined) => void;
  hint?: string;
}) {
  const [text, setText] = useState(isoToDisplay(value));
  return (
    <Field label={label} hint={hint}>
      <TextInput
        style={styles.input}
        value={text}
        keyboardType="numeric"
        placeholder="ДД.ММ.ГГГГ"
        placeholderTextColor={tokens.text.tertiary}
        onChangeText={(t) => {
          const masked = maskDate(t);
          setText(masked);
          onChange(displayToIso(masked));
        }}
      />
    </Field>
  );
}

// ---------- SelectField (модальный пикер) ----------
export interface Option {
  label: string;
  value: string;
  color?: string;
  subtitle?: string;
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = 'Выбрать',
  hint,
  onCreateNew,
  createLabel = 'Создать новую',
  disabled,
}: {
  label: string;
  value: string | undefined;
  options: Option[];
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  onCreateNew?: () => void;
  createLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Field label={label} hint={hint}>
      <Pressable
        style={[styles.input, styles.selectRow, disabled && styles.disabled]}
        onPress={() => !disabled && setOpen(true)}
      >
        {selected?.color ? (
          <View style={[styles.dot, { backgroundColor: selected.color }]} />
        ) : null}
        <Text style={[styles.selectText, !selected && styles.placeholder]} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <MaterialIcons name="expand-more" size={22} color={tokens.text.tertiary} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {options.map((o) => (
                <Pressable
                  key={o.value}
                  style={styles.optionRow}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  {o.color ? <View style={[styles.dot, { backgroundColor: o.color }]} /> : null}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionLabel}>{o.label}</Text>
                    {o.subtitle ? <Text style={styles.optionSub}>{o.subtitle}</Text> : null}
                  </View>
                  {o.value === value ? (
                    <MaterialIcons name="check" size={20} color={tokens.accent.base} />
                  ) : null}
                </Pressable>
              ))}
              {options.length === 0 ? (
                <Text style={styles.emptyOption}>Пока пусто — создайте первую запись</Text>
              ) : null}
            </ScrollView>
            {onCreateNew ? (
              <Pressable
                style={styles.createRow}
                onPress={() => {
                  setOpen(false);
                  onCreateNew();
                }}
              >
                <MaterialIcons name="add" size={20} color={tokens.accent.base} />
                <Text style={styles.createText}>{createLabel}</Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </Field>
  );
}

// ---------- Segmented ----------
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label?: string;
  value: T;
  options: { label: string; value: T }[];
  onChange: (v: T) => void;
  hint?: string;
}) {
  const body = (
    <View style={styles.segment}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            style={[styles.segmentItem, active && styles.segmentActive]}
            onPress={() => onChange(o.value)}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
  if (!label) return body;
  return (
    <Field label={label} hint={hint}>
      {body}
    </Field>
  );
}

// ---------- ColorField ----------
export function ColorField({
  label,
  value,
  onChange,
  colors,
}: {
  label: string;
  value: string;
  onChange: (c: string) => void;
  colors: string[];
}) {
  return (
    <Field label={label}>
      <View style={styles.swatches}>
        {colors.map((c) => (
          <Pressable
            key={c}
            style={[
              styles.swatch,
              { backgroundColor: c },
              value === c && styles.swatchActive,
            ]}
            onPress={() => onChange(c)}
          >
            {value === c ? <MaterialIcons name="check" size={18} color="#FFFFFF" /> : null}
          </Pressable>
        ))}
      </View>
    </Field>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: tokens.spacing.lg },
  label: {
    fontSize: tokens.typography.caption,
    color: tokens.text.secondary,
    fontWeight: '500',
    marginBottom: 6,
  },
  hint: { fontSize: tokens.typography.micro, color: tokens.text.tertiary, marginTop: 4 },
  input: {
    backgroundColor: tokens.surface.white,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.surface.hairline,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
    fontSize: tokens.typography.body,
    color: tokens.text.primary,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  inputFlex: { flex: 1 },
  suffix: { marginLeft: tokens.spacing.sm, fontSize: tokens.typography.body, color: tokens.text.secondary },
  selectRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  selectText: { flex: 1, fontSize: tokens.typography.body, color: tokens.text.primary },
  placeholder: { color: tokens.text.tertiary },
  disabled: { opacity: 0.5 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  backdrop: { flex: 1, backgroundColor: 'rgba(20,30,28,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: tokens.surface.white,
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    padding: tokens.spacing.lg,
    paddingBottom: tokens.spacing.xxl,
  },
  sheetTitle: {
    fontSize: tokens.typography.title,
    fontWeight: '600',
    color: tokens.text.primary,
    marginBottom: tokens.spacing.md,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: tokens.surface.hairline,
  },
  optionLabel: { fontSize: tokens.typography.body, color: tokens.text.primary, fontWeight: '500' },
  optionSub: { fontSize: tokens.typography.caption, color: tokens.text.secondary, marginTop: 2 },
  emptyOption: { paddingVertical: tokens.spacing.lg, color: tokens.text.tertiary, textAlign: 'center' },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingTop: tokens.spacing.lg,
  },
  createText: { fontSize: tokens.typography.body, color: tokens.accent.base, fontWeight: '600' },
  segment: {
    flexDirection: 'row',
    backgroundColor: tokens.surface.neutral,
    borderRadius: tokens.radius.sm,
    padding: 3,
    gap: 3,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.xs,
    alignItems: 'center',
  },
  segmentActive: { backgroundColor: tokens.surface.white },
  segmentText: { fontSize: tokens.typography.caption, color: tokens.text.secondary, fontWeight: '500' },
  segmentTextActive: { color: tokens.text.primary, fontWeight: '600' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.md },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchActive: { borderWidth: 3, borderColor: tokens.surface.white },
});
