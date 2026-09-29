import type { PhotoCategory } from '../../shared/types';

export const PHOTO_CATEGORIES: Array<{ id: PhotoCategory; label: string }> = [
  { id: 'finished-house', label: 'Finished house' },
  { id: 'cable-systems', label: 'Cable systems' },
  { id: 'structural', label: 'Structural' },
  { id: 'electrical', label: 'Electrical' },
  { id: 'data', label: 'Ethernet & data' },
  { id: 'plumbing', label: 'Plumbing' },
  { id: 'hvac', label: 'HVAC' },
  { id: 'security', label: 'Security' },
  { id: 'other', label: 'Other' }
];
