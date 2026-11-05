import * as THREE from 'three';
import type { Biome } from '../shared/types';

/** Terrain biome colors (spring palette; season blending arrives in P3.2). */
export const BIOME_COLORS: Record<Biome, THREE.Color> = {
  meadow: new THREE.Color('#8fbf4d'),
  forest: new THREE.Color('#5c8f3a'),
  sand: new THREE.Color('#e3cf8f'),
  rock: new THREE.Color('#9a958c'),
  water: new THREE.Color('#5b8fa8'),
  marsh: new THREE.Color('#6f8a55'),
  snow: new THREE.Color('#f2f4f6'),
};
export const DIRT = new THREE.Color('#9c7a4e');

export const PROP_COLORS = {
  bush: '#4f8f3a', bushDark: '#3f7a30', apple: '#d2452f', trunk: '#7a5636', leaves: '#3f7d3a', leavesLight: '#5b9a44',
  rock: '#a39d93', berry: '#7a3fa0', flower: ['#f2d14a', '#f28ab5', '#ffffff', '#b58af2'], grass: '#7aaf42',
  wood: '#9a6b3f', stone: '#8d8a84',
};

/** Sky gradient colors per day phase blend (top, horizon). */
export const SKY = {
  day: { top: new THREE.Color('#6fb0e0'), horizon: new THREE.Color('#cfe6f2') },
  dusk: { top: new THREE.Color('#4a5a9a'), horizon: new THREE.Color('#f0a070') },
  night: { top: new THREE.Color('#0b1030'), horizon: new THREE.Color('#25305a') },
};
