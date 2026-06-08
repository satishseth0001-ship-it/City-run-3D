import * as THREE from 'three';

export type GameState = 'START' | 'RUNNING' | 'PAUSED' | 'GAMEOVER';

export type Lane = -1 | 0 | 1; // Left, Middle, Right

export interface Obstacle {
  id: string;
  type: 'HURDLE' | 'OVERHEAD';
  lane: Lane;
  zPosition: number; // Position along the road
  meshY: number;      // Y height of the visual mesh
  boundingBox: {
    width: number;
    height: number;
    depth: number;
  };
  collected?: boolean;
}

export interface Coin {
  id: string;
  lane: Lane;
  zPosition: number;
  meshY: number;
  collected: boolean;
}

export interface RoadSegment {
  id: string;
  zPosition: number;
  mesh: THREE.Group | THREE.Mesh;
}
