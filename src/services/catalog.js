import { supabase } from './supabase.js';

export const CATEGORY_FALLBACK_IMAGES = {
  hair: '/assets/HairCut.jpg',
  color: '/assets/Home%202.jpg',
  makeup: '/assets/Hair%20Service%20More.jpg',
  nails: '/assets/Festive.jpg',
  skin: '/assets/Home3.avif',
  skincare: '/assets/Home3.avif',
  massage: '/assets/Home.jpg',
  default: '/assets/Home3.avif'
};

export function categoryName(category) {
  if (!category) return '';
  if (typeof category === 'string') return category;
  return category.name ?? '';
}

export function categoryLabel(name) {
  return String(name ?? '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function categorySlug(name) {
  return categoryLabel(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function categoryImageUrl(category) {
  const name = categoryName(category);
  const key = categorySlug(name);
  if (category && typeof category === 'object' && category.image_url) return category.image_url;
  if (key.includes('hair')) return CATEGORY_FALLBACK_IMAGES.hair;
  if (key.includes('color')) return CATEGORY_FALLBACK_IMAGES.color;
  if (key.includes('makeup')) return CATEGORY_FALLBACK_IMAGES.makeup;
  if (key.includes('nail')) return CATEGORY_FALLBACK_IMAGES.nails;
  if (key.includes('skin')) return CATEGORY_FALLBACK_IMAGES.skin;
  if (key.includes('massage')) return CATEGORY_FALLBACK_IMAGES.massage;
  return CATEGORY_FALLBACK_IMAGES.default;
}

export async function fetchCategories({ activeOnly = true } = {}) {
  let query = supabase
    .from('categories')
    .select('id, name, slug, image_url, sort_order, is_active, created_at, updated_at')
    .order('sort_order')
    .order('name');

  if (activeOnly) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
