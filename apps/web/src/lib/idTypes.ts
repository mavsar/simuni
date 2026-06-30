import type { ComboboxOption } from '../components/ui/Combobox';
import type { IdType } from './types';

/** Human-readable Slovenian labels for each identity document type. */
export const ID_TYPE_LABEL: Record<IdType, string> = {
  id_card: 'Osebna izkaznica',
  drivers_license: 'Vozniško dovoljenje',
  passport: 'Potni list'
};

export const ID_TYPE_OPTIONS: ComboboxOption<IdType>[] = [
  { value: 'id_card', label: ID_TYPE_LABEL.id_card },
  { value: 'drivers_license', label: ID_TYPE_LABEL.drivers_license },
  { value: 'passport', label: ID_TYPE_LABEL.passport }
];
