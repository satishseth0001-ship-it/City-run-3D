import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GameState, Lane, Obstacle, Coin } from '../types';
import { gameAudio } from '../utils/audio';

interface GameCanvasProps {
  gameState: GameState;
  onGameOver: (score: number, distance: number, coins: number) => void;
  onStatsUpdate: (
    score: number,
    distance: number,
    coins: number,
    activePowerUps?: { magnet: number; shield: boolean; multiplier: number; boost: number }
  ) => void;
  isMuted: boolean;
  selectedCharacter?: string;
}

export default function GameCanvas({
  gameState,
  onGameOver,
  onStatsUpdate,
  isMuted,
  selectedCharacter = 'default',
}: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Refs for animation loop & state persistence to avoid React re-render overhead at 60fps
  const stateRef = useRef({
    gameState,
    score: 0,
    distance: 0,
    coins: 0,
    currentLane: 0 as Lane,
    targetLane: 0 as Lane,
    isJumping: false,
    jumpStartTime: 0,
    jumpProgress: 0,
    isSliding: false,
    slideStartTime: 0,
    speed: 16.0, // Base speed units/sec
    zPos: 0, // Runner's forward position
    yPos: 0, // Runner's height position
    isDead: false,
    magnetTime: 0,
    shieldActive: false,
    multiplierTime: 0,
    boostTime: 0,
    invulnerableTime: 0,
    selectedCharacter,
  });

  // Sync state with React updates (e.g., when parent states change)
  useEffect(() => {
    stateRef.current.gameState = gameState;
    if (gameState === 'RUNNING') {
      gameAudio.init();
    }
  }, [gameState]);

  useEffect(() => {
    stateRef.current.selectedCharacter = selectedCharacter;
  }, [selectedCharacter]);

  // Premium background music interaction boots
  useEffect(() => {
    const initAudio = () => {
      gameAudio.init();
    };
    window.addEventListener('click', initAudio, { once: true });
    window.addEventListener('touchstart', initAudio, { once: true });
    window.addEventListener('keydown', initAudio, { once: true });
    return () => {
      window.removeEventListener('click', initAudio);
      window.removeEventListener('touchstart', initAudio);
      window.removeEventListener('keydown', initAudio);
    };
  }, []);

  useEffect(() => {
    if (isMuted !== gameAudio.getMuteState()) {
      gameAudio.toggleMute();
    }
  }, [isMuted]);

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    // --- GAME INITIALIZATION & RESET ---
    const trafficColors = [
      0xef4444, // Red sedan
      0x3b82f6, // Blue racer
      0x22c55e, // Green cab
      0xeab308, // Yellow cab
      0x3f3f46, // Graphite hatchback
      0x10b981, // Cyan sports car
      0xec4899, // Pink convertible
      0x1e293b  // Stealth black
    ];

    const state = stateRef.current;
    state.score = 0;
    state.distance = 0;
    state.coins = 0;
    state.currentLane = 0;
    state.targetLane = 0;
    state.isJumping = false;
    state.jumpStartTime = 0;
    state.jumpProgress = 0;
    state.isSliding = false;
    state.slideStartTime = 0;
    state.speed = 16.0;
    state.zPos = 0;
    state.yPos = 0;
    state.isDead = false;
    state.magnetTime = 0;
    state.shieldActive = false;
    state.multiplierTime = 0;
    state.boostTime = 0;
    state.invulnerableTime = 0;

    let activePowerUpsOnTrack: {
      id: string;
      type: 'MAGNET' | 'SHIELD' | 'MULTIPLIER' | 'BOOST';
      lane: Lane;
      z: number;
      mesh: THREE.Group;
      collected: boolean;
    }[] = [];

    // Helper: Build a visual power-up mesh
    function buildPowerUpMesh(type: 'MAGNET' | 'SHIELD' | 'MULTIPLIER' | 'BOOST') {
      const group = new THREE.Group();
      
      if (type === 'MAGNET') {
        const redMat = new THREE.MeshStandardMaterial({
          color: 0xef4444,
          metalness: 0.8,
          roughness: 0.2,
          emissive: 0x991b1b,
          emissiveIntensity: 0.2,
        });
        const silverMat = new THREE.MeshStandardMaterial({
          color: 0xe2e8f0,
          metalness: 0.9,
          roughness: 0.1,
        });

        const bottomBar = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 0.1), redMat);
        bottomBar.position.y = -0.15;
        group.add(bottomBar);

        const leftPost = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), redMat);
        leftPost.position.set(-0.125, 0, 0);
        group.add(leftPost);

        const rightPost = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), redMat);
        rightPost.position.set(0.125, 0, 0);
        group.add(rightPost);

        const tipL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), silverMat);
        tipL.position.set(-0.125, 0.19, 0);
        group.add(tipL);

        const tipR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), silverMat);
        tipR.position.set(0.125, 0.19, 0);
        group.add(tipR);
        
        group.scale.set(1.4, 1.4, 1.4);

      } else if (type === 'SHIELD') {
        const shieldMat = new THREE.MeshStandardMaterial({
          color: 0x10b981,
          metalness: 0.3,
          roughness: 0.2,
          transparent: true,
          opacity: 0.75,
          emissive: 0x059669,
          emissiveIntensity: 0.5,
        });
        const coreMat = new THREE.MeshStandardMaterial({
          color: 0x34d399,
          metalness: 0.6,
          roughness: 0.3,
        });

        const outer = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 0), shieldMat);
        group.add(outer);

        const inner = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), coreMat);
        group.add(inner);

        group.scale.set(1.3, 1.3, 1.3);

      } else if (type === 'MULTIPLIER') {
        const gemMat = new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          metalness: 0.8,
          roughness: 0.1,
          emissive: 0xd97706,
          emissiveIntensity: 0.6,
        });
        const ringMat = new THREE.MeshStandardMaterial({
          color: 0xfef08a,
          metalness: 0.9,
          roughness: 0.1,
          transparent: true,
          opacity: 0.6,
        });

        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), gemMat);
        group.add(gem);

        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 6, 16), ringMat);
        ring.rotation.x = Math.PI / 2;
        group.add(ring);

        group.scale.set(1.3, 1.3, 1.3);

      } else if (type === 'BOOST') {
        const arrowMat = new THREE.MeshStandardMaterial({
          color: 0x06b6d4,
          metalness: 0.5,
          roughness: 0.2,
          emissive: 0x0891b2,
          emissiveIntensity: 0.7,
        });

        for (let i = 0; i < 2; i++) {
          const cone = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.35, 4), arrowMat);
          cone.rotation.x = Math.PI / 2;
          cone.position.z = i * 0.22 - 0.11;
          group.add(cone);
        }
        
        group.scale.set(1.2, 1.2, 1.2);
      }

      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      return group;
    }

    let animationFrameId: number;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdbeafe); // Bright daylight sky blue
    scene.fog = new THREE.FogExp2(0xdbeafe, 0.0065); // Warm sky fog smoothly fades elements

    // Camera setup
    const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 1000); // 65 FOV for cinematic runner speed feeling
    camera.position.set(0, 4.8, -7.5); // Stately elevation behind and looking down
    camera.lookAt(0, 1.3, 18);

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      alpha: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Lighting setup
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.6);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfffbeb, 1.8);
    dirLight.position.set(20, 45, 15);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 150;
    const d = 30;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    scene.add(dirLight);

    // Dynamic Materials
    const asphaltMat = new THREE.MeshStandardMaterial({
      color: 0x1e222b, // Real dark asphalt
      roughness: 0.8,
    });
    const laneLineMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
    });
    const curbMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.8,
    });
    const sidewalkMat = new THREE.MeshStandardMaterial({
      color: 0x334155, // Stylish concrete sidewalk shade
      roughness: 0.9,
    });

    const buildingMaterials = [
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.4 }), // Deep Navy Slate
      new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7, metalness: 0.1 }), // Slate grey
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6, metalness: 0.3 }), // Darkened grey
      new THREE.MeshStandardMaterial({ color: 0x5b21b6, roughness: 0.5, metalness: 0.2 }), // Midnight Violet
      new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.4, metalness: 0.4 }), // Sky metal
    ];

    const glassSkyscraperMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.05,
      metalness: 0.95,
      transparent: true,
      opacity: 0.85,
    });

    const windowGlowMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a, // Soft warm illuminated windows
    });

    const steelFrameMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.85,
      roughness: 0.15,
    });

    // Props Materials
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.9 }); // Bench wood
    const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.4 }); // Bench/trash frame
    const hydrantRedMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.5, metalness: 0.2 }); // Hydrant red
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.85 }); // Rich Tree green
    const leafSecondaryMat = new THREE.MeshStandardMaterial({ color: 0x047857, roughness: 0.8 }); // Alternating green
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 }); // Tree trunk
    const streetLightGlowMat = new THREE.MeshBasicMaterial({ color: 0xfef08a }); // Lightbulb flare
    const streetLightPoolMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false, 
    });

    // --- PROCEDURAL RUNNER ASSEMBLE (HIERARCHICAL MANNEQUIN) ---
    const runnerGroup = new THREE.Group();
    scene.add(runnerGroup);

    // Translucent glowing shield bubble
    const runnerShieldBubbleMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.35,
      wireframe: true,
    });
    const runnerShieldBubbleMesh = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 12), runnerShieldBubbleMat);
    runnerShieldBubbleMesh.position.set(0, 0.6, 0);
    runnerShieldBubbleMesh.visible = false;
    runnerGroup.add(runnerShieldBubbleMesh);

    // Cyan boost aura ring
    const runnerBoostAuraMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.45,
      wireframe: true,
    });
    const runnerBoostAuraMesh = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.12, 8, 16), runnerBoostAuraMat);
    runnerBoostAuraMesh.rotation.x = Math.PI / 2;
    runnerBoostAuraMesh.position.set(0, 0.1, 0);
    runnerBoostAuraMesh.visible = false;
    runnerGroup.add(runnerBoostAuraMesh);

    // Group materials
    const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xe0a96d, roughness: 0.6 });
    const shirtMaterial = new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.4 }); // Electric Cyan Activewear
    const pantsMaterial = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 }); // Dark Charcoal sportshorts
    const shoeMaterial = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.3 }); // Vibrant Orange Sneakers
    const visorMaterial = new THREE.MeshStandardMaterial({ color: 0xf43f5e, metalness: 0.9, roughness: 0.1 }); // Magenta Visor

    // Chest & Torso
    const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.45, 0.18), shirtMaterial);
    torsoMesh.position.y = 0.75;
    torsoMesh.castShadow = true;
    runnerGroup.add(torsoMesh);

    // Hips
    const hipsMesh = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.12, 0.18), pantsMaterial);
    hipsMesh.position.y = 0.50;
    hipsMesh.castShadow = true;
    runnerGroup.add(hipsMesh);

    // Head Unit
    const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 8), skinMaterial);
    neckMesh.position.set(0, 1.0, 0);
    runnerGroup.add(neckMesh);

    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), skinMaterial);
    headMesh.position.set(0, 1.12, 0);
    headMesh.castShadow = true;
    runnerGroup.add(headMesh);

    // Visor
    const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.10), visorMaterial);
    visorMesh.position.set(0, 1.14, 0.08);
    runnerGroup.add(visorMesh);

    // --- LEGS WORKSHOP ---
    // Pivots positioned at upper joints, offset for symmetry
    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.10, 0.46, 0);
    runnerGroup.add(leftLegPivot);

    const leftLegUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.24, 8), pantsMaterial);
    leftLegUpper.position.y = -0.12;
    leftLegUpper.castShadow = true;
    leftLegPivot.add(leftLegUpper);

    const leftKneePivot = new THREE.Group();
    leftKneePivot.position.set(0, -0.24, 0);
    leftLegPivot.add(leftKneePivot);

    const leftLegLower = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.24, 8), skinMaterial);
    leftLegLower.position.y = -0.12;
    leftLegLower.castShadow = true;
    leftKneePivot.add(leftLegLower);

    const leftFootMesh = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.05, 0.12), shoeMaterial);
    leftFootMesh.position.set(0, -0.25, 0.03);
    leftFootMesh.castShadow = true;
    leftKneePivot.add(leftFootMesh);

    // Right Leg Pivot
    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.10, 0.46, 0);
    runnerGroup.add(rightLegPivot);

    const rightLegUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.24, 8), pantsMaterial);
    rightLegUpper.position.y = -0.12;
    rightLegUpper.castShadow = true;
    rightLegPivot.add(rightLegUpper);

    const rightKneePivot = new THREE.Group();
    rightKneePivot.position.set(0, -0.24, 0);
    rightLegPivot.add(rightKneePivot);

    const rightLegLower = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.24, 8), skinMaterial);
    rightLegLower.position.y = -0.12;
    rightLegLower.castShadow = true;
    rightKneePivot.add(rightLegLower);

    const rightFootMesh = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.05, 0.12), shoeMaterial);
    rightFootMesh.position.set(0, -0.25, 0.03);
    rightFootMesh.castShadow = true;
    rightKneePivot.add(rightFootMesh);

    // --- ARMS WORKSHOP ---
    // Left Arm Pivot
    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.19, 0.74, 0);
    runnerGroup.add(leftArmPivot);

    const leftArmUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.04, 0.20, 8), shirtMaterial);
    leftArmUpper.position.y = -0.10;
    leftArmUpper.castShadow = true;
    leftArmPivot.add(leftArmUpper);

    const leftElbowPivot = new THREE.Group();
    leftElbowPivot.position.set(0, -0.20, 0);
    leftArmPivot.add(leftElbowPivot);

    const leftArmLower = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.20, 8), skinMaterial);
    leftArmLower.position.y = -0.10;
    leftArmLower.castShadow = true;
    leftElbowPivot.add(leftArmLower);

    // Right Arm Pivot
    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(0.19, 0.74, 0);
    runnerGroup.add(rightArmPivot);

    const rightArmUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.04, 0.20, 8), shirtMaterial);
    rightArmUpper.position.y = -0.10;
    rightArmUpper.castShadow = true;
    rightArmPivot.add(rightArmUpper);

    const rightElbowPivot = new THREE.Group();
    rightElbowPivot.position.set(0, -0.20, 0);
    rightArmPivot.add(rightElbowPivot);

    const rightArmLower = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.20, 8), skinMaterial);
    rightArmLower.position.y = -0.10;
    rightArmLower.castShadow = true;
    rightElbowPivot.add(rightArmLower);

    // Scale down character slightly for perfect visual fitting
    runnerGroup.scale.set(1.1, 1.1, 1.1);

    // Put runner at standard position
    runnerGroup.position.set(0, 0, 0);

    // --- ENVIRONMENT CONFIG — SEAMLESS ENDLESS LOOPING ROAD CHUNKS ---
    const SEGMENT_LENGTH = 32; // Length of individual segments
    const NUM_SEGMENTS = 10;   // Road pieces loaded at once
    const LANE_WIDTH = 2.1;    // Lateral width of each of the 3 lanes
    const ROAD_WIDTH = LANE_WIDTH * 3; // ~6.3 total width

    // --- SHARED RECYCLABLE MODEL DEFINITIONS (PREVENTS memory leaks & garbage collection stalls) ---
    // A. Shared Geometries
    const obstaclePostGeomHurdle = new THREE.CylinderGeometry(0.06, 0.06, 0.9, 8);
    const obstaclePostGeomOverhead = new THREE.CylinderGeometry(0.06, 0.06, 2.3, 8);
    const obstacleBarGeomHurdle = new THREE.BoxGeometry(LANE_WIDTH - 0.1, 0.16, 0.08);
    const obstacleBarGeomOverhead = new THREE.BoxGeometry(LANE_WIDTH - 0.1, 0.3, 0.12);
    const obstacleStripeGeomRed = new THREE.BoxGeometry(0.18, 0.18, 0.10);
    const obstacleStripeGeomBlack = new THREE.BoxGeometry(0.12, 0.32, 0.14);

    const carWheelGeom = new THREE.CylinderGeometry(0.2, 0.2, 0.2, 8);
    carWheelGeom.rotateZ(Math.PI / 2);
    const carHeadlightGeom = new THREE.SphereGeometry(0.06, 6, 6);
    const carTaillightGeom = new THREE.SphereGeometry(0.06, 6, 6);
    const carBaseBodyGeom = new THREE.BoxGeometry(0.9, 0.4, 1.8);
    const carCabinGeom = new THREE.BoxGeometry(0.8, 0.35, 1.0);
    const carWindshieldGeom = new THREE.BoxGeometry(0.72, 0.28, 0.2);
    const carRearWindowGeom = new THREE.BoxGeometry(0.72, 0.28, 0.2);

    // B. Shared Materials
    const obstacleHurdleMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.5,
      emissive: 0xef4444,
      emissiveIntensity: 0.15
    });
    const obstacleWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const obstacleOverheadMat = new THREE.MeshStandardMaterial({
      color: 0xeab308,
      roughness: 0.4,
      emissive: 0xeab308,
      emissiveIntensity: 0.15
    });
    const obstacleBlackMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });

    const carGlassMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.1,
      metalness: 0.9,
      transparent: true,
      opacity: 0.9
    });
    const carWheelMat = new THREE.MeshStandardMaterial({
      color: 0x090d16,
      roughness: 0.8
    });
    const carHeadlightMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a
    });
    const carTaillightMat = new THREE.MeshBasicMaterial({
      color: 0xef4444
    });

    const roadSegments: {
      z: number;
      mesh: THREE.Group;
      decorations: THREE.Group;
      isClose?: boolean;
    }[] = [];

    // Obstacle List for collision queries
    let activeObstacles: {
      id: string;
      type: 'HURDLE' | 'OVERHEAD';
      lane: Lane;
      z: number;
      mesh: THREE.Object3D;
    }[] = [];

    // Coin List
    let activeCoins: {
      id: string;
      lane: Lane;
      z: number;
      mesh: THREE.Object3D;
      collected: boolean;
    }[] = [];

    // Traffic Cars List
    let activeTrafficCars: {
      mesh: THREE.Group;
      z: number;
      speed: number;
      lane: 'LEFT' | 'RIGHT';
      isClose?: boolean;
    }[] = [];

    // Utility helper: attach metadata and original shadow/visibility flags for LOD
    function configureLODMetadata(object: THREE.Object3D, isDetail: boolean = false) {
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (isDetail || child.userData.isDetail) {
            child.userData.isDetail = true;
          }
          child.userData.originalCastShadow = child.castShadow;
          child.userData.originalReceiveShadow = child.receiveShadow;
        }
      });
    }    // Helper: Create stylized premium buildings (Glass skyscrapers, Stepped towers, Columns)
    function createBuilding(height: number, width: number, depth: number, style: number) {
      const bGroup = new THREE.Group();
      
      if (style === 0) {
        // --- LUXURY GLASS SKYSCRAPER ---
        // Inner structural core (dark concrete block)
        const coreGeom = new THREE.BoxGeometry(width - 0.4, height, depth - 0.4);
        const coreMesh = new THREE.Mesh(coreGeom, buildingMaterials[1]); // Slate core
        coreMesh.position.y = height / 2;
        coreMesh.castShadow = true;
        coreMesh.receiveShadow = true;
        bGroup.add(coreMesh);

        // Outer glass panels
        const glassGeom = new THREE.BoxGeometry(width, height - 2, depth);
        const glassMesh = new THREE.Mesh(glassGeom, glassSkyscraperMat);
        glassMesh.position.y = (height - 2) / 2 + 1;
        glassMesh.castShadow = true;
        glassMesh.userData.isDetail = true;
        bGroup.add(glassMesh);

        // Steel frame columns on corners
        const cornerGeom = new THREE.CylinderGeometry(0.12, 0.12, height, 8);
        const offsets = [
          { x: -width/2, z: -depth/2 },
          { x: width/2, z: -depth/2 },
          { x: -width/2, z: depth/2 },
          { x: width/2, z: depth/2 },
        ];
        offsets.forEach(pos => {
          const col = new THREE.Mesh(cornerGeom, steelFrameMat);
          col.position.set(pos.x, height/2, pos.z);
          col.userData.isDetail = true;
          bGroup.add(col);
        });

        // Add fine window dividers / metallic grid
        const floors = Math.floor(height / 4);
        for (let f = 1; f < floors; f++) {
          const gridRing = new THREE.Mesh(new THREE.BoxGeometry(width + 0.05, 0.15, depth + 0.05), steelFrameMat);
          gridRing.position.y = f * 4;
          gridRing.userData.isDetail = true;
          bGroup.add(gridRing);
        }

        // Roof Heli-pad / architectural spire and red pulsing beacon
        const spireGeom = new THREE.CylinderGeometry(0.04, 0.04, 3, 8);
        const spire = new THREE.Mesh(spireGeom, steelFrameMat);
        spire.position.set(0, height + 1.5, 0);
        spire.userData.isDetail = true;
        bGroup.add(spire);

        const beaconGeom = new THREE.SphereGeometry(0.15, 8, 8);
        const beacon = new THREE.Mesh(beaconGeom, new THREE.MeshBasicMaterial({ color: 0xef4444 })); // Red aviation safe signal
        beacon.position.set(0, height + 3, 0);
        beacon.userData.isDetail = true;
        bGroup.add(beacon);

      } else if (style === 1) {
        // --- STEPPED SKYSCRAPER ---
        // Tier 1: Wide Base
        const h1 = height * 0.55;
        const w1 = width;
        const d1 = depth;
        const baseGeom = new THREE.BoxGeometry(w1, h1, d1);
        const baseMesh = new THREE.Mesh(baseGeom, buildingMaterials[0]); // Navy slate
        baseMesh.position.y = h1 / 2;
        baseMesh.castShadow = true;
        baseMesh.receiveShadow = true;
        bGroup.add(baseMesh);

        // Window indicators for base
        const floors1 = Math.floor(h1 / 3.0);
        for (let f = 1; f < floors1; f++) {
          const windowRowY = f * 3.0;
          const numCols = Math.floor(w1 / 1.5);
          for (let c = 0; c < numCols; c++) {
            const wX = -w1 / 2 + 0.8 + c * 1.5;
            const winF = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, 0.01), windowGlowMat);
            winF.position.set(wX, windowRowY, d1/2 + 0.02);
            winF.userData.isDetail = true;
            bGroup.add(winF);

            const winL = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.5, 0.35), windowGlowMat);
            winL.position.set(-w1/2 - 0.02, windowRowY, wX * (d1 / w1));
            winL.userData.isDetail = true;
            bGroup.add(winL);

            const winR = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.5, 0.35), windowGlowMat);
            winR.position.set(w1/2 + 0.02, windowRowY, wX * (d1 / w1));
            winR.userData.isDetail = true;
            bGroup.add(winR);
          }
        }

        // Tier 2: Mid Tower Setback
        const h2 = height * 0.35;
        const w2 = width * 0.75;
        const d2 = depth * 0.75;
        const midGeom = new THREE.BoxGeometry(w2, h2, d2);
        const midMesh = new THREE.Mesh(midGeom, buildingMaterials[2]); // Charcoal Gray
        midMesh.position.set(0, h1 + h2/2, 0);
        midMesh.castShadow = true;
        midMesh.receiveShadow = true;
        bGroup.add(midMesh);

        // Tier 2 Windows
        const floors2 = Math.floor(h2 / 3.0);
        for (let f = 0; f < floors2; f++) {
          const windowRowY = h1 + 1.5 + f * 3.0;
          const numCols = Math.floor(w2 / 1.3);
          for (let c = 0; c < numCols; c++) {
            const wX = -w2 / 2 + 0.6 + c * 1.3;
            const winF = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.45, 0.01), windowGlowMat);
            winF.position.set(wX, windowRowY, d2/2 + 0.02);
            winF.userData.isDetail = true;
            bGroup.add(winF);
          }
        }

        // Tier 3: Sleek architectural crown (glass cube + antenna spire)
        const h3 = height * 0.1;
        const w3 = width * 0.45;
        const d3 = depth * 0.45;
        const topGeom = new THREE.BoxGeometry(w3, h3, d3);
        const topMesh = new THREE.Mesh(topGeom, glassSkyscraperMat);
        topMesh.position.set(0, h1 + h2 + h3/2, 0);
        topMesh.userData.isDetail = true;
        bGroup.add(topMesh);

        // Long antenna
        const antGeom = new THREE.CylinderGeometry(0.04, 0.06, 4.5, 8);
        const antenna = new THREE.Mesh(antGeom, steelFrameMat);
        antenna.position.set(0, h1 + h2 + h3 + 2.25, 0);
        antenna.castShadow = true;
        antenna.userData.isDetail = true;
        bGroup.add(antenna);

        const blinker = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
        blinker.position.set(0, h1 + h2 + h3 + 4.5, 0);
        blinker.userData.isDetail = true;
        bGroup.add(blinker);

      } else if (style === 2) {
        // --- CYLINDRICAL MODERN GLASS TOWER ---
        const radius = Math.min(width, depth) / 1.8;
        const cylGeom = new THREE.CylinderGeometry(radius - 0.2, radius, height, 16);
        const cylMesh = new THREE.Mesh(cylGeom, glassSkyscraperMat);
        cylMesh.position.y = height / 2;
        cylMesh.castShadow = true;
        cylMesh.receiveShadow = true;
        bGroup.add(cylMesh);

        // Steel spine frames going vertically
        const numPillars = 8;
        for (let p = 0; p < numPillars; p++) {
          const angle = (p / numPillars) * Math.PI * 2;
          const vertCol = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, height, 8), steelFrameMat);
          vertCol.position.set(Math.cos(angle) * radius, height/2, Math.sin(angle) * radius);
          vertCol.castShadow = true;
          vertCol.userData.isDetail = true;
          bGroup.add(vertCol);
        }

        // Horizontal accent rings
        const numRings = Math.floor(height / 5);
        for (let r = 1; r < numRings; r++) {
          const ringGeom = new THREE.TorusGeometry(radius + 0.02, 0.08, 8, 24);
          const ring = new THREE.Mesh(ringGeom, steelFrameMat);
          ring.rotation.x = Math.PI / 2;
          ring.position.y = r * 5;
          ring.userData.isDetail = true;
          bGroup.add(ring);
        }

        // Dome top cap
        const capGeom = new THREE.SphereGeometry(radius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        const cap = new THREE.Mesh(capGeom, steelFrameMat);
        cap.position.y = height;
        cap.userData.isDetail = true;
        bGroup.add(cap);

      } else {
        // --- COGNITIVE METROPOLITAN BRICK/CONCRETE APARTMENTS ---
        const concreteGeom = new THREE.BoxGeometry(width, height, depth);
        const concreteMesh = new THREE.Mesh(concreteGeom, buildingMaterials[3]); // Violet Slate
        concreteMesh.position.y = height / 2;
        concreteMesh.castShadow = true;
        concreteMesh.receiveShadow = true;
        bGroup.add(concreteMesh);

        // Large detailed block windows organized elegantly
        const floors = Math.floor(height / 3.5);
        for (let f = 1; f < floors; f++) {
          const windowRowY = f * 3.5;
          const colsX = Math.floor(width / 1.6);
          for (let c = 0; c < colsX; c++) {
            const wX = -width / 2 + 0.9 + c * 1.6;
            
            // Front facing double visual panels
            const winF = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 0.01), windowGlowMat);
            winF.position.set(wX, windowRowY, depth/2 + 0.02);
            winF.userData.isDetail = true;
            bGroup.add(winF);

            // Left facing visual window slots
            const winL = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.9, 0.55), windowGlowMat);
            winL.position.set(-width/2 - 0.02, windowRowY, wX);
            winL.userData.isDetail = true;
            bGroup.add(winL);

            // Frame overlay line
            const borderF = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.08, 0.05), steelFrameMat);
            borderF.position.set(wX, windowRowY - 0.5, depth/2 + 0.01);
            borderF.userData.isDetail = true;
            bGroup.add(borderF);
          }
        }

        // Roof-top ventilation units/AC fans
        const acGeom = new THREE.BoxGeometry(1.2, 0.9, 1.2);
        const acUnit = new THREE.Mesh(acGeom, steelFrameMat);
        acUnit.position.set(0, height + 0.45, 0);
        acUnit.castShadow = true;
        acUnit.userData.isDetail = true;
        bGroup.add(acUnit);

        const fanGeom = new THREE.CylinderGeometry(0.44, 0.44, 0.1, 12);
        const fan = new THREE.Mesh(fanGeom, darkMetalMat);
        fan.position.set(0, height + 0.95, 0);
        fan.userData.isDetail = true;
        bGroup.add(fan);
      }

      configureLODMetadata(bGroup, false);

      return bGroup;
    }

    // Helper: Build a low-poly tree with layered leaves and trunk
    function createTree() {
      const treeGroup = new THREE.Group();
      
      // Trunk
      const trunkGeom = new THREE.CylinderGeometry(0.12, 0.16, 1.6, 8);
      const trunk = new THREE.Mesh(trunkGeom, trunkMat);
      trunk.position.y = 0.8;
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      treeGroup.add(trunk);

      // Layered foliage (staggered cones or spheres for low poly feel)
      const colors = [leafMat, leafSecondaryMat, leafMat];
      const radiusOff = [0.85, 0.70, 0.50];
      const YOff = [1.8, 2.4, 3.0];
      
      for (let l = 0; l < 3; l++) {
        const leafGeom = new THREE.ConeGeometry(radiusOff[l], 0.9, 8);
        const leaves = new THREE.Mesh(leafGeom, colors[l]);
        leaves.position.y = YOff[l];
        leaves.castShadow = true;
        leaves.userData.isDetail = true;
        treeGroup.add(leaves);
      }

      treeGroup.scale.set(1.1, 1.1, 1.1);
      configureLODMetadata(treeGroup, false);
      return treeGroup;
    }

    // Helper: Build a bent metal street light pole with emissive lamp
    function createStreetLight() {
      const poleGroup = new THREE.Group();

      // Base
      const baseMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.35, 8), darkMetalMat);
      baseMesh.position.y = 0.175;
      baseMesh.castShadow = true;
      poleGroup.add(baseMesh);

      // Main tall pole vertical
      const mainPole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 8), steelFrameMat);
      mainPole.position.y = 1.6;
      mainPole.castShadow = true;
      poleGroup.add(mainPole);

      // Bent curve (bent horizontal horizontal piece)
      const horizontalArm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 8), steelFrameMat);
      horizontalArm.rotation.z = Math.PI / 2;
      horizontalArm.position.set(-0.5, 3.15, 0);
      horizontalArm.castShadow = true;
      poleGroup.add(horizontalArm);

      // Light shroud
      const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.25, 8), darkMetalMat);
      shroud.position.set(-0.95, 3.05, 0);
      shroud.castShadow = true;
      poleGroup.add(shroud);

      // Glowing lightbulb visual
      const lightBulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), streetLightGlowMat);
      lightBulb.position.set(-0.95, 2.95, 0);
      poleGroup.add(lightBulb);

      // Subtle volumetric visual light beam cone
      const coneGeom = new THREE.ConeGeometry(1.6, 3.0, 16, 1, true); // open-ended cone
      const lightBeam = new THREE.Mesh(coneGeom, coneMat);
      lightBeam.position.set(-0.95, 1.45, 0);
      lightBeam.userData.isDetail = true;
      poleGroup.add(lightBeam);

      // Add flat light pool visual on the pavement beneath the streetlight
      const poolGeom = new THREE.PlaneGeometry(3.5, 3.5);
      const lightPool = new THREE.Mesh(poolGeom, streetLightPoolMat);
      lightPool.rotation.x = -Math.PI / 2;
      lightPool.position.set(-1.3, 0.08, 0); // Position under the shroud slightly offset to road
      lightPool.userData.isDetail = true;
      poleGroup.add(lightPool);

      configureLODMetadata(poleGroup, false);
      return poleGroup;
    }

    // Helper: Build an urban Traffic Sign / warning arrow
    function createTrafficSign() {
      const signGroup = new THREE.Group();

      // Pole
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.1, 8), steelFrameMat);
      pole.position.y = 1.05;
      pole.castShadow = true;
      signGroup.add(pole);

      // Sign plate background
      const signPlateGeom = new THREE.BoxGeometry(0.65, 0.65, 0.05);
      const labelMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 }); // Yellow/Red circular warning sign
      const signPlate = new THREE.Mesh(signPlateGeom, labelMat);
      signPlate.position.set(0, 1.85, 0);
      signPlate.castShadow = true;
      signGroup.add(signPlate);

      // Inner icon visual (e.g. white arrow warning)
      const arrowMesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 0.07), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      arrowMesh.position.set(0, 1.85, 0.01);
      arrowMesh.userData.isDetail = true;
      signGroup.add(arrowMesh);

      // Sign symbol arrow cap
      const arrowCap = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.25, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      arrowCap.rotation.z = -Math.PI / 2;
      arrowCap.position.set(0.175, 1.85, 0.01);
      arrowCap.userData.isDetail = true;
      signGroup.add(arrowCap);

      configureLODMetadata(signGroup, false);
      return signGroup;
    }

    // Helper: Build elegant street metal/wooden bench
    function createBench() {
      const benchGroup = new THREE.Group();

      // Left support metal leg
      const legL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.8), darkMetalMat);
      legL.position.set(-0.8, 0.25, 0);
      legL.castShadow = true;
      benchGroup.add(legL);

      // Right support metal leg
      const legR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.8), darkMetalMat);
      legR.position.set(0.8, 0.25, 0);
      legR.castShadow = true;
      benchGroup.add(legR);

      // Wooden slats
      const slatGeom = new THREE.BoxGeometry(1.8, 0.08, 0.15);
      for (let s = 0; s < 3; s++) {
        const slat = new THREE.Mesh(slatGeom, woodMat);
        slat.position.set(0, 0.5, -0.3 + s * 0.26);
        slat.castShadow = true;
        slat.userData.isDetail = true;
        benchGroup.add(slat);
      }

      // Wooden Backrest slat
      const backrest = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.35, 0.08), woodMat);
      backrest.position.set(0, 0.85, -0.34);
      backrest.rotation.x = -0.15;
      backrest.castShadow = true;
      backrest.userData.isDetail = true;
      benchGroup.add(backrest);

      const metalSupportBack = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.05), darkMetalMat);
      metalSupportBack.position.set(0, 0.65, -0.34);
      metalSupportBack.userData.isDetail = true;
      benchGroup.add(metalSupportBack);

      configureLODMetadata(benchGroup, false);
      return benchGroup;
    }

    // Helper: Build a Fire Hydrant
    function createFireHydrant() {
      const hydrant = new THREE.Group();

      // Main barrel body
      const mainChub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.6, 8), hydrantRedMat);
      mainChub.position.y = 0.3;
      mainChub.castShadow = true;
      hydrant.add(mainChub);

      // Top cap dome
      const topCap = new THREE.Mesh(new THREE.SphereGeometry(0.115, 8, 8), hydrantRedMat);
      topCap.position.y = 0.6;
      topCap.castShadow = true;
      topCap.userData.isDetail = true;
      hydrant.add(topCap);

      // Side caps
      const nozzleGeom = new THREE.CylinderGeometry(0.05, 0.05, 0.15, 8);
      const nozzleL = new THREE.Mesh(nozzleGeom, darkMetalMat);
      nozzleL.rotation.z = Math.PI / 2;
      nozzleL.position.set(-0.12, 0.45, 0);
      nozzleL.userData.isDetail = true;
      hydrant.add(nozzleL);

      const nozzleR = new THREE.Mesh(nozzleGeom, darkMetalMat);
      nozzleR.rotation.z = -Math.PI / 2;
      nozzleR.position.set(0.12, 0.45, 0);
      nozzleR.userData.isDetail = true;
      hydrant.add(nozzleR);

      configureLODMetadata(hydrant, false);
      return hydrant;
    }

    // Helper: Build a beautiful, low-poly stylized traffic car model
    function createTrafficCar(bodyColor: number) {
      const carGroup = new THREE.Group();

      // Materials
      const bodyMat = new THREE.MeshStandardMaterial({
        color: bodyColor,
        roughness: 0.2,
        metalness: 0.8
      });

      // Chassis/Body base (Lower cabin)
      const baseBody = new THREE.Mesh(carBaseBodyGeom, bodyMat);
      baseBody.position.y = 0.35;
      baseBody.castShadow = true;
      baseBody.receiveShadow = true;
      carGroup.add(baseBody);

      // Upper Cabin/Roof
      const cabin = new THREE.Mesh(carCabinGeom, bodyMat);
      cabin.position.set(0, 0.7, -0.1);
      cabin.castShadow = true;
      carGroup.add(cabin);

      // Windshield & Windows
      const windshield = new THREE.Mesh(carWindshieldGeom, carGlassMat);
      windshield.position.set(0, 0.68, 0.42);
      windshield.rotation.x = -0.3;
      windshield.userData.isDetail = true;
      carGroup.add(windshield);

      const rearWindow = new THREE.Mesh(carRearWindowGeom, carGlassMat);
      rearWindow.position.set(0, 0.68, -0.62);
      rearWindow.rotation.x = 0.3;
      rearWindow.userData.isDetail = true;
      carGroup.add(rearWindow);

      // Headlights
      const headlightL = new THREE.Mesh(carHeadlightGeom, carHeadlightMat);
      headlightL.position.set(-0.32, 0.38, 0.9);
      headlightL.userData.isDetail = true;
      carGroup.add(headlightL);

      const headlightR = new THREE.Mesh(carHeadlightGeom, carHeadlightMat);
      headlightR.position.set(0.32, 0.38, 0.9);
      headlightR.userData.isDetail = true;
      carGroup.add(headlightR);

      // Taillights
      const taillightL = new THREE.Mesh(carTaillightGeom, carTaillightMat);
      taillightL.position.set(-0.32, 0.38, -0.9);
      taillightL.userData.isDetail = true;
      carGroup.add(taillightL);

      const taillightR = new THREE.Mesh(carTaillightGeom, carTaillightMat);
      taillightR.position.set(0.32, 0.38, -0.9);
      taillightR.userData.isDetail = true;
      carGroup.add(taillightR);

      // Wheels
      const wheelsPos = [
        { x: -0.48, y: 0.2, z: 0.52 },
        { x: 0.48, y: 0.2, z: 0.52 },
        { x: -0.48, y: 0.2, z: -0.52 },
        { x: 0.48, y: 0.2, z: -0.52 },
      ];

      wheelsPos.forEach(p => {
        const w = new THREE.Mesh(carWheelGeom, carWheelMat);
        w.position.set(p.x, p.y, p.z);
        w.castShadow = true;
        w.name = 'wheel';
        w.userData.isDetail = true;
        carGroup.add(w);
      });

      configureLODMetadata(carGroup, false);

      return carGroup;
    }

    // Generate coin 3D visual geometry
    const coinGeom = new THREE.TorusGeometry(0.24, 0.07, 8, 16);
    const coinMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15, // Golden glowing coin
      metalness: 0.9,
      roughness: 0.1,
      emissive: 0xeab308,
      emissiveIntensity: 0.4,
    });

    // Helper: Build a visual obstacle
    function buildObstacleMesh(type: 'HURDLE' | 'OVERHEAD') {
      const obstacleGroup = new THREE.Group();
      
      if (type === 'HURDLE') {
        // Two vertical metal posts
        const postL = new THREE.Mesh(obstaclePostGeomHurdle, obstacleHurdleMat);
        postL.position.set(-LANE_WIDTH / 2 + 0.1, 0.45, 0);
        postL.castShadow = true;
        obstacleGroup.add(postL);

        const postR = new THREE.Mesh(obstaclePostGeomHurdle, obstacleHurdleMat);
        postR.position.set(LANE_WIDTH / 2 - 0.1, 0.45, 0);
        postR.castShadow = true;
        obstacleGroup.add(postR);

        // Striped horizontal bar
        const bar = new THREE.Mesh(obstacleBarGeomHurdle, obstacleWhiteMat);
        bar.position.set(0, 0.8, 0);
        bar.castShadow = true;
        obstacleGroup.add(bar);

        // Add visual stripe overlays
        for (let s = -2; s <= 2; s++) {
          const redStripe = new THREE.Mesh(obstacleStripeGeomRed, obstacleHurdleMat);
          redStripe.position.set(s * 0.35, 0.8, 0);
          redStripe.userData.isDetail = true;
          obstacleGroup.add(redStripe);
        }

      } else {
        // OVERHEAD slide-bar Warning hazard
        // Much taller posts on sides
        const postL = new THREE.Mesh(obstaclePostGeomOverhead, obstacleOverheadMat);
        postL.position.set(-LANE_WIDTH / 2 + 0.08, 1.15, 0);
        postL.castShadow = true;
        obstacleGroup.add(postL);

        const postR = new THREE.Mesh(obstaclePostGeomOverhead, obstacleOverheadMat);
        postR.position.set(LANE_WIDTH / 2 - 0.08, 1.15, 0);
        postR.castShadow = true;
        obstacleGroup.add(postR);

        // Sturdy horizontal hazard bar hanging at top (e.g., height Y = 1.3 to 1.7)
        const bar = new THREE.Mesh(obstacleBarGeomOverhead, obstacleOverheadMat);
        bar.position.set(0, 1.75, 0);
        bar.castShadow = true;
        obstacleGroup.add(bar);

        // Yellow-black warning stripes on the overhead bar
        for (let s = -2; s <= 2; s++) {
          const stripe = new THREE.Mesh(obstacleStripeGeomBlack, obstacleBlackMat);
          stripe.rotation.z = Math.PI / 4;
          stripe.position.set(s * 0.32, 1.75, 0);
          stripe.userData.isDetail = true;
          obstacleGroup.add(stripe);
        }
      }

      configureLODMetadata(obstacleGroup, false);

      return obstacleGroup;
    }

    // Spawns items and adds them to segment decorations with premium continuous trails and fair spacing
    function populateSegment(decorationsGroup: THREE.Group, zBase: number) {
      if (zBase < 15) return; // Absolute minimal safety padding at the very beginning of the entire game

      // Case 0: Early starter zone (zBase between 15 and 50)
      // Provide immediate premium, high-density coins from the beginning of the run with NO obstacles to let the player warm up
      if (zBase < 50) {
        // Create an elegant, safe dual-lane parallel introductory straight coin path
        const l1 = -1;
        const l2 = 0;
        const count = 5;
        const startZ = zBase - SEGMENT_LENGTH/2 + 2;
        const spacing = 4.2;

        for (let i = 0; i < count; i++) {
          const coinZ = startZ + i * spacing;
          
          // Spawn first row
          const cMesh1 = new THREE.Mesh(coinGeom, coinMat);
          cMesh1.position.set(-l1 * LANE_WIDTH, 0.6, coinZ);
          cMesh1.rotation.y = Math.random() * Math.PI;
          scene.add(cMesh1);
          activeCoins.push({
            id: `coin-intro-${l1}-${coinZ}-${Math.random()}`,
            lane: l1 as Lane,
            z: coinZ,
            mesh: cMesh1,
            collected: false,
          });

          // Spawn second row
          const cMesh2 = new THREE.Mesh(coinGeom, coinMat);
          cMesh2.position.set(-l2 * LANE_WIDTH, 0.6, coinZ);
          cMesh2.rotation.y = Math.random() * Math.PI;
          scene.add(cMesh2);
          activeCoins.push({
            id: `coin-intro-${l2}-${coinZ}-${Math.random()}`,
            lane: l2 as Lane,
            z: coinZ,
            mesh: cMesh2,
            collected: false,
          });
        }
        return;
      }

      // Normal running zone: Select beautiful, balanced patterns for continuous pacing
      const roll = Math.random();

      if (roll < 0.25) {
        // --- PATTERN A: "THE SINE WAVE RIBBON" (Pure Flowing Coin Trail, No Obstacles) ---
        // A single continuous winding train of coins that curves smoothly across lanes
        const startZ = zBase - SEGMENT_LENGTH / 2 + 2;
        const count = 8;
        const spacing = 3.6; // Slightly tighter for a beautiful, dense trail feel
        const startLane = (Math.floor(Math.random() * 2) - 1); // Start at leftist (-1) or middle (0)

        for (let i = 0; i < count; i++) {
          const coinZ = startZ + i * spacing;
          
          // Calculate winding interpolation across lanes using a sine wave
          const wave = Math.sin((i / (count - 1)) * Math.PI * 1.5); // 1.5 cycles wave
          const computedLaneVal = Math.round(startLane + wave + 0.5); // shift right smoothly
          const lane = Math.max(-1, Math.min(1, computedLaneVal)) as Lane;

          const coinMesh = new THREE.Mesh(coinGeom, coinMat);
          coinMesh.position.set(-lane * LANE_WIDTH, 0.6, coinZ);
          coinMesh.rotation.y = Math.random() * Math.PI;
          scene.add(coinMesh);

          activeCoins.push({
            id: `coin-wave-${lane}-${coinZ}-${Math.random()}`,
            lane,
            z: coinZ,
            mesh: coinMesh,
            collected: false,
          });
        }

      } else if (roll < 0.50) {
        // --- PATTERN B: "THE LEAP OF FAITH" (HURDLE with Parabolic Coin Path + Secondary rewards) ---
        // One clear hurdle obstacle, guided by a gorgeous jump rainbow of coins
        const obstacleLane = (Math.floor(Math.random() * 3) - 1) as Lane;
        const obstacleZ = zBase + 2; // Positioned cleanly in the middle of the segment

        // 1. Build hurdle mesh
        const hurdleMesh = buildObstacleMesh('HURDLE');
        hurdleMesh.position.set(-obstacleLane * LANE_WIDTH, 0, obstacleZ);
        scene.add(hurdleMesh);

        activeObstacles.push({
          id: `obstacle-jump-${obstacleZ}-${Math.random()}`,
          type: 'HURDLE',
          lane: obstacleLane,
          z: obstacleZ,
          mesh: hurdleMesh,
        });

        // 2. Parabolic coin path over hurdle (perfectly smooth jumping trajectory guidance)
        const curvePoints = [
          { zOff: -7.0, y: 0.6 },
          { zOff: -3.5, y: 1.4 },
          { zOff: 0.0, y: 2.2 }, // Peak apex directly above hurdle
          { zOff: 3.5, y: 1.4 },
          { zOff: 7.0, y: 0.6 }
        ];

        curvePoints.forEach(pos => {
          const coinZ = obstacleZ + pos.zOff;
          const coinMesh = new THREE.Mesh(coinGeom, coinMat);
          coinMesh.position.set(-obstacleLane * LANE_WIDTH, pos.y, coinZ);
          coinMesh.rotation.y = Math.random() * Math.PI;
          scene.add(coinMesh);

          activeCoins.push({
            id: `coin-jump-${coinZ}-${Math.random()}`,
            lane: obstacleLane,
            z: coinZ,
            mesh: coinMesh,
            collected: false,
          });
        });

        // 3. Continuous reward side trail: Spawn standard coins in another lane to ensure no empty gaps
        const sideLane = ((obstacleLane + 2) % 3 - 1) as Lane; // Mathematically selects an adjacent lane
        const sideZStart = zBase - SEGMENT_LENGTH / 2 + 3;
        const sideCount = 4;
        const sideSpacing = 4.5;
        
        for (let i = 0; i < sideCount; i++) {
          const coinZ = sideZStart + i * sideSpacing;
          // Avoid overlaps with the main jumping parabola's outer bounds
          if (Math.abs(coinZ - obstacleZ) > 8) {
            const coinMesh = new THREE.Mesh(coinGeom, coinMat);
            coinMesh.position.set(-sideLane * LANE_WIDTH, 0.6, coinZ);
            coinMesh.rotation.y = Math.random() * Math.PI;
            scene.add(coinMesh);

            activeCoins.push({
              id: `coin-sidejump-${sideLane}-${coinZ}-${Math.random()}`,
              lane: sideLane,
              z: coinZ,
              mesh: coinMesh,
              collected: false,
            });
          }
        }

      } else if (roll < 0.75) {
        // --- PATTERN C: "UNDERPASS SLIDE" (Caution Overpass with Low Sliders + Parallel Track) ---
        // Slide underbar requires crouching. Side lane has safe coins or standard running trails
        const slideLane = (Math.floor(Math.random() * 3) - 1) as Lane;
        const obstacleZ = zBase - 1; // Spaced cleanly

        // 1. Build overhead slide mesh
        const slideMesh = buildObstacleMesh('OVERHEAD');
        slideMesh.position.set(-slideLane * LANE_WIDTH, 0, obstacleZ);
        scene.add(slideMesh);

        activeObstacles.push({
          id: `obstacle-slide-${obstacleZ}-${Math.random()}`,
          type: 'OVERHEAD',
          lane: slideLane,
          z: obstacleZ,
          mesh: slideMesh,
        });

        // 2. Spawn low sliding-friendly coins before, under, and after the slide
        const slideCoinsCount = 4;
        const slideSpacing = 3.2;
        const startSlideZ = obstacleZ - (slideCoinsCount - 1) * slideSpacing / 2;

        for (let i = 0; i < slideCoinsCount; i++) {
          const coinZ = startSlideZ + i * slideSpacing;
          const coinMesh = new THREE.Mesh(coinGeom, coinMat);
          coinMesh.position.set(-slideLane * LANE_WIDTH, 0.35, coinZ); // Low elevation for sliding
          scene.add(coinMesh);

          activeCoins.push({
            id: `coin-slide-${slideLane}-${coinZ}-${Math.random()}`,
            lane: slideLane,
            z: coinZ,
            mesh: coinMesh,
            collected: false,
          });
        }

        // 3. Keep other road section rewarding: Spawn standard coins in the remaining lanes
        const openLanes = ([-1, 0, 1] as Lane[]).filter(ln => ln !== slideLane);
        openLanes.forEach(ol => {
          // Just place some beautiful coins along the open tracks
          const coinZ = zBase + 4;
          const coinMesh = new THREE.Mesh(coinGeom, coinMat);
          coinMesh.position.set(-ol * LANE_WIDTH, 0.6, coinZ);
          scene.add(coinMesh);

          activeCoins.push({
            id: `coin-slide-opp-${ol}-${coinZ}-${Math.random()}`,
            lane: ol,
            z: coinZ,
            mesh: coinMesh,
            collected: false,
          });
        });

      } else {
        // --- PATTERN D: "THE GATEWAY" (Double Blockade with 1 Clear Golden Lane) ---
        // Clean clear bypass scenario. Spawns matching obstacles in 2 lanes, with exactly ONE free lane marked by high-density gold
        const freeLane = (Math.floor(Math.random() * 3) - 1) as Lane;
        const obstacleZ = zBase + 1; // Clear middle of the segment

        const lanes = [-1, 0, 1] as Lane[];
        lanes.forEach(ln => {
          if (ln === freeLane) {
            // Fill the free safe lane with high density rewards guiding the player through!
            const count = 5;
            const startZ = zBase - SEGMENT_LENGTH/2 + 3;
            const spacing = 4.5;
            for (let i = 0; i < count; i++) {
              const coinZ = startZ + i * spacing;
              const coinMesh = new THREE.Mesh(coinGeom, coinMat);
              coinMesh.position.set(-ln * LANE_WIDTH, 0.6, coinZ);
              scene.add(coinMesh);

              activeCoins.push({
                id: `coin-gate-${ln}-${coinZ}-${Math.random()}`,
                lane: ln,
                z: coinZ,
                mesh: coinMesh,
                collected: false,
              });
            }
          } else {
            // Spawn hurdles or bar obstacles in the blockaded lanes
            const obstacleType = Math.random() > 0.5 ? 'HURDLE' : 'OVERHEAD';
            const visualMesh = buildObstacleMesh(obstacleType);
            visualMesh.position.set(-ln * LANE_WIDTH, 0, obstacleZ);
            scene.add(visualMesh);

            activeObstacles.push({
              id: `obstacle-block-${obstacleZ}-${ln}-${Math.random()}`,
              type: obstacleType,
              lane: ln,
              z: obstacleZ,
              mesh: visualMesh,
            });
          }
        });
      }

      // Occasional Powerup Spawner in populated segments (15% chance per recycled segment)
      if (Math.random() < 0.15 && zBase >= 50) {
        const types: ('MAGNET' | 'SHIELD' | 'MULTIPLIER' | 'BOOST')[] = ['MAGNET', 'SHIELD', 'MULTIPLIER', 'BOOST'];
        const type = types[Math.floor(Math.random() * types.length)];
        const lane = (Math.floor(Math.random() * 3) - 1) as Lane;
        const powerZ = zBase + (Math.random() * 12 - 6);

        const pMesh = buildPowerUpMesh(type);
        pMesh.position.set(-lane * LANE_WIDTH, 0.7, powerZ);
        scene.add(pMesh);

        activePowerUpsOnTrack.push({
          id: `powerup-${type}-${lane}-${powerZ}-${Math.random()}`,
          type,
          lane,
          z: powerZ,
          mesh: pMesh,
          collected: false,
        });
      }
    }

    // Create Initial Road Segments
    for (let i = 0; i < NUM_SEGMENTS; i++) {
      const zPos = i * SEGMENT_LENGTH;
      const segGroup = new THREE.Group();
      segGroup.position.z = zPos;

      // Road plane
      const roadMesh = new THREE.Mesh(new THREE.BoxGeometry(ROAD_WIDTH, 0.1, SEGMENT_LENGTH), asphaltMat);
      roadMesh.position.y = -0.05;
      roadMesh.receiveShadow = true;
      segGroup.add(roadMesh);

      // Dashlane dividers (broken dash lines for high-fidelity realism)
      const dashLength = 3.5;
      const dashGap = 4.5;
      const numDashes = Math.floor(SEGMENT_LENGTH / (dashLength + dashGap)) + 1;
      const dashGeom = new THREE.BoxGeometry(0.08, 0.02, dashLength);
      
      for (let d = 0; d < numDashes; d++) {
        const dashZ = -SEGMENT_LENGTH / 2 + (d * (dashLength + dashGap)) + dashLength / 2;
        if (Math.abs(dashZ) < SEGMENT_LENGTH / 2) {
          const dl = new THREE.Mesh(dashGeom, laneLineMat);
          dl.position.set(-LANE_WIDTH / 2, 0.01, dashZ);
          segGroup.add(dl);

          const dr = new THREE.Mesh(dashGeom, laneLineMat);
          dr.position.set(LANE_WIDTH / 2, 0.01, dashZ);
          segGroup.add(dr);
        }
      }

      // Zebra crossings on certain segments for a superb urban intersection feel
      if (i % 3 === 0 && i > 0) {
        const stripeY = 0.01;
        const stripeGeom = new THREE.BoxGeometry(0.4, 0.01, 3.2);
        for (let s = -2; s <= 2; s++) {
          const crossBar = new THREE.Mesh(stripeGeom, laneLineMat);
          crossBar.position.set(s * (ROAD_WIDTH / 5.2), stripeY, 0);
          segGroup.add(crossBar);
        }
      }

      // Curbs on sides
      const curbGeom = new THREE.BoxGeometry(0.24, 0.24, SEGMENT_LENGTH);
      const leftCurb = new THREE.Mesh(curbGeom, curbMat);
      leftCurb.position.set(-ROAD_WIDTH / 2 - 0.12, 0.12, 0);
      leftCurb.castShadow = true;
      leftCurb.receiveShadow = true;
      segGroup.add(leftCurb);

      const rightCurb = new THREE.Mesh(curbGeom, curbMat);
      rightCurb.position.set(ROAD_WIDTH / 2 + 0.12, 0.12, 0);
      rightCurb.castShadow = true;
      rightCurb.receiveShadow = true;
      segGroup.add(rightCurb);

      // Infinite modern sidewalk
      const sidewalkGeom = new THREE.BoxGeometry(10, 0.15, SEGMENT_LENGTH);
      const leftSidewalk = new THREE.Mesh(sidewalkGeom, sidewalkMat);
      leftSidewalk.position.set(-ROAD_WIDTH / 2 - 5.2, 0.075, 0);
      leftSidewalk.receiveShadow = true;
      segGroup.add(leftSidewalk);

      const rightSidewalk = new THREE.Mesh(sidewalkGeom, sidewalkMat);
      rightSidewalk.position.set(ROAD_WIDTH / 2 + 5.2, 0.075, 0);
      rightSidewalk.receiveShadow = true;
      segGroup.add(rightSidewalk);

      // Sidewalk Props (placed neatly at x = -3.8 and x = 3.8 on concrete pads)
      // 1. Volumetric street lights at z = -12 and z = 12
      const lightLeft1 = createStreetLight();
      lightLeft1.position.set(-3.7, 0, -12);
      lightLeft1.rotation.y = Math.PI / 2;
      segGroup.add(lightLeft1);

      const lightRight1 = createStreetLight();
      lightRight1.position.set(3.7, 0, 12);
      lightRight1.rotation.y = -Math.PI / 2;
      segGroup.add(lightRight1);

      // 2. High fidelity trees at z = -6 and z = 6
      const treeLeft = createTree();
      treeLeft.position.set(-3.9, 0, -6);
      segGroup.add(treeLeft);

      const treeRight = createTree();
      treeRight.position.set(3.9, 0, 6);
      segGroup.add(treeRight);

      // 3. Traffic signs indicating directions/lanes
      if (i % 2 === 0) {
        const sign = createTrafficSign();
        sign.position.set(-3.8, 0, 0);
        sign.rotation.y = Math.PI / 2;
        segGroup.add(sign);
      }

      // 4. Detailed wooden-metal benches and fire hydrants (alternating sides gracefully)
      if (i % 3 === 1) {
        const bench = createBench();
        bench.position.set(3.9, 0, -2);
        bench.rotation.y = -Math.PI / 2;
        segGroup.add(bench);

        const hydrant = createFireHydrant();
        hydrant.position.set(-3.8, 0, 4);
        segGroup.add(hydrant);
      } else if (i % 3 === 2) {
        const bench = createBench();
        bench.position.set(-3.9, 0, 2);
        bench.rotation.y = Math.PI / 2;
        segGroup.add(bench);

        const hydrant = createFireHydrant();
        hydrant.position.set(3.8, 0, -4);
        segGroup.add(hydrant);
      }

      // 5. Stylized parked cars on side streets (sidewalk edges)
      if (i > 0 && (i % 3 === 0 || i % 4 === 1)) {
        const parkOnLeft = i % 2 === 0;
        const parkX = parkOnLeft ? -5.35 : 5.35;
        const parkColor = trafficColors[i % trafficColors.length];
        const parkCar = createTrafficCar(parkColor);
        parkCar.position.set(parkX, 0, parkOnLeft ? -4 : 4);
        parkCar.rotation.y = parkOnLeft ? Math.PI : 0;
        segGroup.add(parkCar);
      }

      // Skyscrapers placed far back for an open sky metropolis feel (No tight canyon-style walls!)
      if (i > 0) {
        // Left Building (at x = -10.5 to -13.0, set back nicely)
        const xoffsetL = -10.0 - Math.random() * 3.0;
        const styleL = (i) % 4; // Cycles styles: 0, 1, 2, 3
        const heightL = 16 + Math.random() * 22;
        const widthL = 6 + Math.random() * 3.0;
        const depthL = 6 + Math.random() * 3.0;
        
        const bL = createBuilding(heightL, widthL, depthL, styleL);
        bL.position.set(xoffsetL, 0, Math.random() * 4 - 2);
        segGroup.add(bL);

        // Right Building (at x = 10.5 to 13.0)
        const xoffsetR = 10.0 + Math.random() * 3.0;
        const styleR = (i + 2) % 4;
        const heightR = 16 + Math.random() * 22;
        const widthR = 6 + Math.random() * 3.0;
        const depthR = 6 + Math.random() * 3.0;
        
        const bR = createBuilding(heightR, widthR, depthR, styleR);
        bR.position.set(xoffsetR, 0, Math.random() * 4 - 2);
        segGroup.add(bR);

        // Distant background silhouettes to establish layers of structural skyline depth
        if (i % 2 === 0) {
          const distBgL = createBuilding(35 + Math.random() * 20, 10, 10, (i + 1) % 4);
          distBgL.position.set(-22 - Math.random() * 5, 0, -8);
          segGroup.add(distBgL);
        } else {
          const distBgR = createBuilding(35 + Math.random() * 20, 10, 10, (i + 3) % 4);
          distBgR.position.set(22 + Math.random() * 5, 0, 8);
          segGroup.add(distBgR);
        }
      }

      // Add segment container to Scene
      scene.add(segGroup);

      // Separate empty group designated purely to recycle obstacles
      const decorGroup = new THREE.Group();
      decorGroup.position.z = zPos;
      scene.add(decorGroup);

      roadSegments.push({
        z: zPos,
        mesh: segGroup,
        decorations: decorGroup,
      });

      // Spawn default hurdles/coins
      populateSegment(decorGroup, zPos);
    }

    // Spawn 8 active dynamic traffic cars along the highway
    activeTrafficCars = [];
    for (let c = 0; c < 8; c++) {
      const isLeft = c % 2 === 0;
      const xOffset = isLeft ? -7.0 : 7.0; // Left side lane flowing left, right side lane flowing right
      const lane = isLeft ? 'LEFT' : 'RIGHT';
      
      const carGroup = createTrafficCar(trafficColors[c % trafficColors.length]);
      carGroup.name = 'traffic-car';
      
      // Distribute them nicely along the tracks
      const startZ = 25 + c * 35 + Math.random() * 15;
      carGroup.position.set(xOffset, 0, startZ);
      
      // Rotate left side traffic cars to face backward (opposite direction of player)
      if (isLeft) {
        carGroup.rotation.y = Math.PI;
      }

      scene.add(carGroup);

      activeTrafficCars.push({
        mesh: carGroup,
        z: startZ,
        speed: isLeft ? (15 + Math.random() * 8) : (6 + Math.random() * 6),
        lane
      });
    }

    // Floor receiver for elegant shadows (invisible plane on floor)
    const shadowFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ opacity: 0.16 })
    );
    shadowFloor.rotation.x = -Math.PI / 2;
    shadowFloor.position.y = 0.01;
    shadowFloor.receiveShadow = true;
    scene.add(shadowFloor);

    // --- CONTROLLER HANDLERS ---
    let touchStartX = 0;
    let touchStartY = 0;
    let hasSwiped = false;

    const handleTouchStart = (e: TouchEvent) => {
      if (stateRef.current.gameState !== 'RUNNING') return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      hasSwiped = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (stateRef.current.gameState !== 'RUNNING') return;
      if (hasSwiped) return;

      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;

      const dx = currentX - touchStartX;
      const dy = currentY - touchStartY;
      const threshold = 35; // Fine responsive swipe threshold

      if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
        if (Math.abs(dx) > Math.abs(dy)) {
          // Horizontal Swiping Lane Switches
          if (dx > threshold) {
            triggerLaneSwitch(1); // Swipe Right -> Right lane
            hasSwiped = true;
          } else if (dx < -threshold) {
            triggerLaneSwitch(-1); // Swipe Left -> Left lane
            hasSwiped = true;
          }
        } else {
          // Vertical Actions: Jump & Slide
          if (dy > threshold) {
            triggerSlide(); // Swipe Down -> Slide
            hasSwiped = true;
          } else if (dy < -threshold) {
            triggerJump(); // Swipe Up -> Jump
            hasSwiped = true;
          }
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (stateRef.current.gameState !== 'RUNNING' || hasSwiped) return;
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;

      const dx = touchEndX - touchStartX;
      const dy = touchEndY - touchStartY;
      const threshold = 35;

      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > threshold) {
          triggerLaneSwitch(1); // Swipe Right -> Right lane
        } else if (dx < -threshold) {
          triggerLaneSwitch(-1); // Swipe Left -> Left lane
        }
      } else {
        if (dy > threshold) {
          triggerSlide(); // Swipe Down -> Slide
        } else if (dy < -threshold) {
          triggerJump(); // Swipe Up -> Jump
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (stateRef.current.gameState !== 'RUNNING') return;

      const key = e.key.toLowerCase();
      if (key === 'arrowleft' || key === 'a') {
        triggerLaneSwitch(-1);
      } else if (key === 'arrowright' || key === 'd') {
        triggerLaneSwitch(1);
      } else if (key === 'arrowup' || key === 'w' || key === ' ') {
        e.preventDefault(); // Stop window jumps space bar drift
        triggerJump();
      } else if (key === 'arrowdown' || key === 's') {
        e.preventDefault();
        triggerSlide();
      }
    };

    const triggerLaneSwitch = (direction: number) => {
      const state = stateRef.current;
      if (state.isDead) return;

      const current = state.targetLane;
      let next = current + direction;
      if (next < -1) next = -1;
      if (next > 1) next = 1;

      if (next !== current) {
        state.targetLane = next as Lane;
      }
    };

    const triggerJump = () => {
      const state = stateRef.current;
      if (state.isDead || state.isJumping || state.isSliding) return;

      state.isJumping = true;
      state.jumpStartTime = performance.now();
      gameAudio.playJump();
    };

    const triggerSlide = () => {
      const state = stateRef.current;
      if (state.isDead || state.isJumping || state.isSliding) return;

      state.isSliding = true;
      state.slideStartTime = performance.now();
      gameAudio.playSlide();
    };

    // Attach Event Listeners
    window.addEventListener('keydown', handleKeyDown);
    const canvasEl = canvasRef.current;
    canvasEl.addEventListener('touchstart', handleTouchStart, { passive: true });
    canvasEl.addEventListener('touchmove', handleTouchMove, { passive: true });
    canvasEl.addEventListener('touchend', handleTouchEnd, { passive: true });

    // --- RESIZE OBSERVER ENGINE (Robust Framework layout binding) ---
    const handleResize = (width: number, height: number) => {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        handleResize(width, height);
      }
    });
    resizeObserver.observe(containerRef.current);

    // Initial resize sync
    handleResize(containerRef.current.clientWidth, containerRef.current.clientHeight);

    // --- ENVIRONMENTAL TIME OF DAY DESIGN ---
    const CYCLE_DURATION = 80; // 80 seconds per celestial loop (Day -> Sunset -> Night -> Dawn)

    // Preset celestial colors for seamless transition interpolation
    const DAY_SKY = new THREE.Color(0xdbeafe);       // Original radiant daylight sky blue
    const EVENING_SKY = new THREE.Color(0xf97316);   // Warm blazing sunset orange
    const NIGHT_SKY = new THREE.Color(0x0f172a);     // Rich deep indigo midnight sky

    const DAY_DIR = new THREE.Color(0xfffbeb);       // Bright warm sunlight
    const EVENING_DIR = new THREE.Color(0xfdba74);   // Soft pastel orange sun rays
    const NIGHT_DIR = new THREE.Color(0x8bb0fc);     // Brighter silver blue moonlight

    const DAY_HEMI_SKY = new THREE.Color(0xffffff);  // General high daylight skylight
    const DAY_HEMI_GND = new THREE.Color(0x444444);  // Concrete ground bounce reflection

    const EVENING_HEMI_SKY = new THREE.Color(0xc084fc); // Sunset magenta atmospheric glow
    const EVENING_HEMI_GND = new THREE.Color(0x431407); // Sunset brownish dirt reflection

    const NIGHT_HEMI_SKY = new THREE.Color(0x32328c);   // Soft brighter blue-indigo night skylight
    const NIGHT_HEMI_GND = new THREE.Color(0x1a2133);   // Soft visible midnight slate ground reflection

    const WINDOW_DAY = new THREE.Color(0x1e293b);    // Daytime unlit tower windows
    const WINDOW_EVENING = new THREE.Color(0xeab308); // Evening warm yellow turn-on glow
    const WINDOW_NIGHT = new THREE.Color(0xfef08a);   // Nighttime brilliant warm glow

    const LGT_DAY = new THREE.Color(0x334155);       // Unlit streetlight bulbs
    const LGT_EVENING = new THREE.Color(0xfacc15);   // Soft amber bulb glow
    const LGT_NIGHT = new THREE.Color(0xfef08a);     // Nighttime intense bright street flares

    interface EnvConfig {
      skyColor: THREE.Color;
      dirLightColor: THREE.Color;
      dirLightIntensity: number;
      dirLightPos: THREE.Vector3;
      hemiSkyColor: THREE.Color;
      hemiGroundColor: THREE.Color;
      hemiIntensity: number;
      windowColor: THREE.Color;
      streetlightColor: THREE.Color;
      lightBeamOpacity: number;
    }

    // Static registers for environment calculations to completely banish GC pressure
    const registerSkyColor = new THREE.Color();
    const registerDirLightColor = new THREE.Color();
    const registerDirLightPos = new THREE.Vector3();
    const registerHemiSkyColor = new THREE.Color();
    const registerHemiGroundColor = new THREE.Color();
    const registerWindowColor = new THREE.Color();
    const registerStreetlightColor = new THREE.Color();

    const envConfigRes: EnvConfig = {
      skyColor: registerSkyColor,
      dirLightColor: registerDirLightColor,
      dirLightIntensity: 1.8,
      dirLightPos: registerDirLightPos,
      hemiSkyColor: registerHemiSkyColor,
      hemiGroundColor: registerHemiGroundColor,
      hemiIntensity: 1.6,
      windowColor: registerWindowColor,
      streetlightColor: registerStreetlightColor,
      lightBeamOpacity: 0,
    };

    // Direct mathematical lerp inside registers for perfect mobile efficiency
    const getEnvConfigAtTime = (t: number): EnvConfig => {
      if (t < 0.25) {
        // --- 1. MIDDAY sunshine (Bright, crisp shadows, streetlights disabled) ---
        registerSkyColor.copy(DAY_SKY);
        registerDirLightColor.copy(DAY_DIR);
        envConfigRes.dirLightIntensity = 1.8;
        registerDirLightPos.set(20, 45, 15);
        registerHemiSkyColor.copy(DAY_HEMI_SKY);
        registerHemiGroundColor.copy(DAY_HEMI_GND);
        envConfigRes.hemiIntensity = 1.6;
        registerWindowColor.copy(WINDOW_DAY);
        registerStreetlightColor.copy(LGT_DAY);
        envConfigRes.lightBeamOpacity = 0.0;
      } else if (t < 0.45) {
        // --- 2. GOLDEN HOUR SUNSET (Day transitioning into Blazing Evening Sunset) ---
        const f = (t - 0.25) / 0.20;
        registerSkyColor.copy(DAY_SKY).lerp(EVENING_SKY, f);
        registerDirLightColor.copy(DAY_DIR).lerp(EVENING_DIR, f);
        envConfigRes.dirLightIntensity = THREE.MathUtils.lerp(1.8, 1.25, f);
        registerDirLightPos.set(
          THREE.MathUtils.lerp(20, 35, f),
          THREE.MathUtils.lerp(45, 20, f),
          THREE.MathUtils.lerp(15, 10, f)
        );
        registerHemiSkyColor.copy(DAY_HEMI_SKY).lerp(EVENING_HEMI_SKY, f);
        registerHemiGroundColor.copy(DAY_HEMI_GND).lerp(EVENING_HEMI_GND, f);
        envConfigRes.hemiIntensity = THREE.MathUtils.lerp(1.6, 1.15, f);
        registerWindowColor.copy(WINDOW_DAY).lerp(WINDOW_EVENING, f);
        registerStreetlightColor.copy(LGT_DAY).lerp(LGT_EVENING, f);
        envConfigRes.lightBeamOpacity = THREE.MathUtils.lerp(0.0, 0.06, f);
      } else if (t < 0.55) {
        // --- 3. DUSK (Deep twilight purple glow as the sun sets completely) ---
        const f = (t - 0.45) / 0.10;
        registerSkyColor.copy(EVENING_SKY).lerp(NIGHT_SKY, f);
        registerDirLightColor.copy(EVENING_DIR).lerp(NIGHT_DIR, f);
        envConfigRes.dirLightIntensity = THREE.MathUtils.lerp(1.25, 1.0, f); // Higher visibility
        registerDirLightPos.set(
          THREE.MathUtils.lerp(35, -20, f),
          THREE.MathUtils.lerp(20, 30, f),
          THREE.MathUtils.lerp(10, -15, f)
        );
        registerHemiSkyColor.copy(EVENING_HEMI_SKY).lerp(NIGHT_HEMI_SKY, f);
        registerHemiGroundColor.copy(EVENING_HEMI_GND).lerp(NIGHT_HEMI_GND, f);
        envConfigRes.hemiIntensity = THREE.MathUtils.lerp(1.15, 1.15, f); // Higher visibility
        registerWindowColor.copy(WINDOW_EVENING).lerp(WINDOW_NIGHT, f);
        registerStreetlightColor.copy(LGT_EVENING).lerp(LGT_NIGHT, f);
        envConfigRes.lightBeamOpacity = THREE.MathUtils.lerp(0.06, 0.14, f);
      } else if (t < 0.80) {
        // --- 4. MIDNIGHT (Cool moonlight, shining streetlights & skyscrapers glowing) ---
        registerSkyColor.copy(NIGHT_SKY);
        registerDirLightColor.copy(NIGHT_DIR);
        envConfigRes.dirLightIntensity = 1.0; // Brighter moon rays
        registerDirLightPos.set(-20, 30, -15);
        registerHemiSkyColor.copy(NIGHT_HEMI_SKY);
        registerHemiGroundColor.copy(NIGHT_HEMI_GND);
        envConfigRes.hemiIntensity = 1.15; // Brighter overall scene illumination
        registerWindowColor.copy(WINDOW_NIGHT);
        registerStreetlightColor.copy(LGT_NIGHT);
        envConfigRes.lightBeamOpacity = 0.14;
      } else {
        // --- 5. DAWN (Midnight transitioning back to Day) ---
        const f = (t - 0.80) / 0.20;
        registerSkyColor.copy(NIGHT_SKY).lerp(DAY_SKY, f);
        registerDirLightColor.copy(NIGHT_DIR).lerp(DAY_DIR, f);
        envConfigRes.dirLightIntensity = THREE.MathUtils.lerp(1.0, 1.8, f);
        registerDirLightPos.set(
          THREE.MathUtils.lerp(-20, 20, f),
          THREE.MathUtils.lerp(30, 45, f),
          THREE.MathUtils.lerp(-15, 15, f)
        );
        registerHemiSkyColor.copy(NIGHT_HEMI_SKY).lerp(DAY_HEMI_SKY, f);
        registerHemiGroundColor.copy(NIGHT_HEMI_GND).lerp(DAY_HEMI_GND, f);
        envConfigRes.hemiIntensity = THREE.MathUtils.lerp(1.15, 1.6, f);
        registerWindowColor.copy(WINDOW_NIGHT).lerp(WINDOW_DAY, f);
        registerStreetlightColor.copy(LGT_NIGHT).lerp(LGT_DAY, f);
        envConfigRes.lightBeamOpacity = THREE.MathUtils.lerp(0.14, 0.0, f);
      }

      return envConfigRes;
    };

    // --- GAME ENGINE HEART — UPDATE TICK ---
    let lastTime = performance.now();

    const gameLoop = () => {
      animationFrameId = requestAnimationFrame(gameLoop);

      const state = stateRef.current;
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1); // Cap delta time at 100ms
      lastTime = now;

      // Update 3D mannequin active colors programmatically depending on selectedCharacter
      const char = state.selectedCharacter || 'default';
      if (char === 'apex' || char === 'default') {
        skinMaterial.color.setHex(0xe0a96d);
        shirtMaterial.color.setHex(0x06b6d4);
        pantsMaterial.color.setHex(0x1e293b);
        shoeMaterial.color.setHex(0xf97316);
        visorMaterial.color.setHex(0xf43f5e);
      } else if (char === 'phantom') {
        skinMaterial.color.setHex(0xd1fae5); // Pale green skin contrast
        shirtMaterial.color.setHex(0x22c55e); // Electric Neon Green shirt
        pantsMaterial.color.setHex(0x3b0764); // Dark Purple pants
        shoeMaterial.color.setHex(0xa855f7); // Bright violet kicks
        visorMaterial.color.setHex(0x4ade80); // Luminous Lime visor
      } else if (char === 'ninja') {
        skinMaterial.color.setHex(0xe0a96d); // Standard skin
        shirtMaterial.color.setHex(0xef4444); // Crimson red stealth chestplate
        pantsMaterial.color.setHex(0x020617); // Obsidian midnight shorts
        shoeMaterial.color.setHex(0x1e1b4b); // Navy indigo sneakers
        visorMaterial.color.setHex(0xff3333); // Blood red cyber glow visor
      } else if (char === 'vaporwave') {
        skinMaterial.color.setHex(0xffeedd); // Bright white-cream skin
        shirtMaterial.color.setHex(0xec4899); // Hot Magenta Pink shirt
        pantsMaterial.color.setHex(0x4c1d95); // Deep purple retro tights
        shoeMaterial.color.setHex(0xf472b6); // Neon pink shoes
        visorMaterial.color.setHex(0x06b6d4); // Sky Cyan cyber shield
      } else if (char === 'aureum') {
        skinMaterial.color.setHex(0x1e293b); // Obsidian dark skin
        shirtMaterial.color.setHex(0xf59e0b); // Liquid gold shirt
        pantsMaterial.color.setHex(0x0f172a); // Charcoal black shorts
        shoeMaterial.color.setHex(0xd97706); // Dark honey shoes
        visorMaterial.color.setHex(0xfef08a); // Pale Gold visor
      }

      // 0. Update Environment Time-of-day Celestial Spheres gracefully in real-time
      const tCycle = ((now / 1000) % CYCLE_DURATION) / CYCLE_DURATION;
      const env = getEnvConfigAtTime(tCycle);

      // Interpolate main background sky and depth integrated fog
      scene.background = env.skyColor;
      if (scene.fog) {
        (scene.fog as THREE.FogExp2).color.copy(env.skyColor);
      }

      // Live Celestial Light updates (Sun position & Moon glow intensity)
      dirLight.color.copy(env.dirLightColor);
      dirLight.intensity = env.dirLightIntensity;
      dirLight.position.copy(env.dirLightPos);

      hemiLight.color.copy(env.hemiSkyColor);
      hemiLight.groundColor.copy(env.hemiGroundColor);
      hemiLight.intensity = env.hemiIntensity;

      // Dynamic ambient emitters scaling with nighttime darkness
      windowGlowMat.color.copy(env.windowColor);
      streetLightGlowMat.color.copy(env.streetlightColor);
      coneMat.opacity = env.lightBeamOpacity;
      streetLightPoolMat.color.copy(env.streetlightColor);
      streetLightPoolMat.opacity = env.lightBeamOpacity * 1.5;

      if (state.gameState === 'RUNNING' && !state.isDead) {
        // Dynamic Footsteps & Audio Updates
        const isRunningOnGround = !state.isJumping && !state.isSliding;
        gameAudio.update(dt, isRunningOnGround);

        // 1. Core Physics & Speed Progressive acceleration
        state.speed += 0.05 * dt; // Gradually speeds up to feel challenging
        if (state.speed > 32) state.speed = 32;

        // Decrement active power-up timers
        if (state.magnetTime > 0) state.magnetTime = Math.max(0, state.magnetTime - dt);
        if (state.multiplierTime > 0) state.multiplierTime = Math.max(0, state.multiplierTime - dt);
        if (state.boostTime > 0) state.boostTime = Math.max(0, state.boostTime - dt);
        if (state.invulnerableTime > 0) state.invulnerableTime = Math.max(0, state.invulnerableTime - dt);

        const speedMultiplier = state.boostTime > 0 ? 1.5 : 1.0;
        const lastDistance = state.distance;
        state.zPos += state.speed * speedMultiplier * dt;
        state.distance = Math.floor(state.zPos / 2.5); // Proportional distance representation
        
        const distanceDelta = state.distance - lastDistance;
        if (distanceDelta > 0) {
          state.score += distanceDelta * (state.multiplierTime > 0 ? 2 : 1);
        }

        // Propagate statistics score directly via callbacks
        onStatsUpdate(state.score, state.distance, state.coins, {
          magnet: state.magnetTime,
          shield: state.shieldActive,
          multiplier: state.multiplierTime,
          boost: state.boostTime,
        });

        // 2. Lateral Lane Shifts Linear Interpolation
        const targetX = -state.targetLane * LANE_WIDTH;
        // Cinematic lateral responsiveness
        runnerGroup.position.x += (targetX - runnerGroup.position.x) * 16 * dt;

        // Cinematic rolling visual tilt while changing action angles
        const pathDiff = targetX - runnerGroup.position.x;
        runnerGroup.rotation.y = pathDiff * 0.25;
        runnerGroup.rotation.z = -pathDiff * 0.18;

        // 3. Vertical jump parabolas
        if (state.isJumping) {
          const jumpDur = 650; // Milliseconds duration
          const elapsed = now - state.jumpStartTime;
          const progress = Math.min(elapsed / jumpDur, 1.0);
          
          // Smooth projectile formula: Y altitude
          const heightApex = 2.1;
          state.yPos = heightApex * (1 - 4 * Math.pow(progress - 0.5, 2));

          if (progress >= 1.0) {
            state.isJumping = false;
            state.yPos = 0;
          }
        }

        // 4. Slide height shrink (duck mechanics)
        let visualScaleY = 1.0;
        let visualOffsetY = 0;
        if (state.isSliding) {
          const slideDur = 700; // Milliseconds limit
          const elapsed = now - state.slideStartTime;
          const progress = Math.min(elapsed / slideDur, 1.0);

          if (progress < 0.8) {
            // Rapidly descend torso crouch scale Y
            visualScaleY = 0.40;
            // Shunt group origin to compensate center offsets
            visualOffsetY = -0.25;
          } else {
            // Transition back up gracefully
            const lerpUp = (progress - 0.8) / 0.2;
            visualScaleY = 0.40 + 0.60 * lerpUp;
            visualOffsetY = -0.25 * (1 - lerpUp);
          }

          if (progress >= 1.0) {
            state.isSliding = false;
          }
        }

        // Apply scale matrices to Visual Runner Group
        runnerGroup.position.y = state.yPos + visualOffsetY;
        runnerGroup.scale.y = visualScaleY;

        // Propagate runner position forward
        runnerGroup.position.z = state.zPos;

        // 5. Kinematic 3D Bone Joint Running Rotator
        const tempo = (now / 1000) * (state.speed * 0.72);
        const legSwing = Math.sin(tempo) * 0.72;
        const legSwingOpposite = Math.sin(tempo + Math.PI) * 0.72;

        if (!state.isJumping && !state.isSliding) {
          // Normal sporty run gait cycling
          leftLegPivot.rotation.x = legSwing;
          leftKneePivot.rotation.x = Math.max(0, -legSwing) * 1.3;

          rightLegPivot.rotation.x = legSwingOpposite;
          rightKneePivot.rotation.x = Math.max(0, -legSwingOpposite) * 1.3;

          leftArmPivot.rotation.x = -legSwing * 0.9;
          leftElbowPivot.rotation.x = 0.5 + Math.abs(legSwing) * 0.4;

          rightArmPivot.rotation.x = -legSwingOpposite * 0.9;
          rightElbowPivot.rotation.x = 0.5 + Math.abs(legSwingOpposite) * 0.4;

          // Gentle torso bobbing and stride head nodding
          torsoMesh.position.y = 0.75 + Math.sin(tempo * 2) * 0.035;
          headMesh.position.y = 1.12 + Math.sin(tempo * 2) * 0.02;
        } else if (state.isJumping) {
          // Stylized suspended high-altitude posture
          leftLegPivot.rotation.x = 0.4;
          leftKneePivot.rotation.x = 0.9;
          rightLegPivot.rotation.x = -0.2;
          rightKneePivot.rotation.x = 0.6;

          leftArmPivot.rotation.x = -1.2;
          rightArmPivot.rotation.x = -1.2;
          leftElbowPivot.rotation.x = 0.3;
          rightElbowPivot.rotation.x = 0.3;
        } else if (state.isSliding) {
          // Low drag slide crouch
          leftLegPivot.rotation.x = -1.2;
          leftKneePivot.rotation.x = 1.6;
          rightLegPivot.rotation.x = -1.2;
          rightKneePivot.rotation.x = 1.6;

          leftArmPivot.rotation.x = 0.6;
          rightArmPivot.rotation.x = 0.6;
        }

        // 6. Seamless Infinite Road Recycle & Teleportation
        roadSegments.forEach((segment) => {
          // Once segment falls 32 units far behind camera's follow boundary
          if (segment.z + SEGMENT_LENGTH < camera.position.z - 15) {
            segment.z += NUM_SEGMENTS * SEGMENT_LENGTH;
            segment.mesh.position.z = segment.z;
            segment.decorations.position.z = segment.z;

            // Purge and garbage collect this segment's old items safely
            const oldObstaclesToPrune = activeObstacles.filter(o => {
              const matched = (Math.abs(o.z - (segment.z - NUM_SEGMENTS * SEGMENT_LENGTH)) < SEGMENT_LENGTH / 2 + 5);
              if (matched) {
                scene.remove(o.mesh);
              }
              return matched;
            });
            activeObstacles = activeObstacles.filter(o => !oldObstaclesToPrune.includes(o));

            const oldCoinsToPrune = activeCoins.filter(c => {
              const matched = (Math.abs(c.z - (segment.z - NUM_SEGMENTS * SEGMENT_LENGTH)) < SEGMENT_LENGTH / 2 + 5);
              if (matched) {
                scene.remove(c.mesh);
              }
              return matched;
            });
            activeCoins = activeCoins.filter(c => !oldCoinsToPrune.includes(c));

            const oldPowerUpsToPrune = activePowerUpsOnTrack.filter(p => {
              const matched = (Math.abs(p.z - (segment.z - NUM_SEGMENTS * SEGMENT_LENGTH)) < SEGMENT_LENGTH / 2 + 5);
              if (matched) {
                scene.remove(p.mesh);
              }
              return matched;
            });
            activePowerUpsOnTrack = activePowerUpsOnTrack.filter(p => !oldPowerUpsToPrune.includes(p));

            // Generate clean fresh set of challenges in front!
            populateSegment(segment.decorations, segment.z);
          }
        });

        // 7. Coin Rotation Animators & Collision Sensor
        activeCoins.forEach((coin) => {
          if (coin.collected) return;

          // Magnet Pull physical vector attraction
          if (state.magnetTime > 0) {
            const distToPlayerZ = Math.abs(coin.mesh.position.z - runnerGroup.position.z);
            if (distToPlayerZ < 12.0) {
              const speedFactor = 15.0 * dt;
              coin.mesh.position.x += (runnerGroup.position.x - coin.mesh.position.x) * speedFactor;
              coin.mesh.position.y += ((runnerGroup.position.y + 0.5) - coin.mesh.position.y) * speedFactor;
              coin.mesh.position.z += (runnerGroup.position.z - coin.mesh.position.z) * speedFactor;
            }
          }

          // Dynamic rotating hover sparkle
          coin.mesh.rotation.y += 2.5 * dt;

          const distZ = Math.abs(coin.mesh.position.z - runnerGroup.position.z);
          const distX = Math.abs(coin.mesh.position.x - runnerGroup.position.x);
          const distY = Math.abs(coin.mesh.position.y - runnerGroup.position.y);

          // Touch Sphere triggers collection bounds
          if (distZ < 1.1 && distX < 0.95 && distY < 1.1) {
            coin.collected = true;
            scene.remove(coin.mesh);
            state.coins += 1;
            state.score += 15 * (state.multiplierTime > 0 ? 2 : 1);
            gameAudio.playCoin();
          }
        });

        // 7b. Track Powerups Hover & Collision Handler
        activePowerUpsOnTrack.forEach((p) => {
          if (p.collected) return;

          // Gentle rotation & hover
          p.mesh.rotation.y += 2.0 * dt;
          p.mesh.position.y = 0.7 + Math.sin(performance.now() / 150) * 0.08;

          const distZ = Math.abs(p.mesh.position.z - runnerGroup.position.z);
          const distX = Math.abs(p.mesh.position.x - runnerGroup.position.x);
          const distY = Math.abs(p.mesh.position.y - runnerGroup.position.y);

          if (distZ < 1.1 && distX < 0.95 && distY < 1.2) {
            p.collected = true;
            scene.remove(p.mesh);
            gameAudio.playPowerUp();

            if (p.type === 'MAGNET') {
              state.magnetTime = 12.0;
            } else if (p.type === 'SHIELD') {
              state.shieldActive = true;
            } else if (p.type === 'MULTIPLIER') {
              state.multiplierTime = 12.0;
            } else if (p.type === 'BOOST') {
              state.boostTime = 6.0;
            }
          }
        });

        // 7c. Update dynamic power-up overlays around our runner mannequin
        runnerShieldBubbleMesh.visible = state.shieldActive;
        if (state.shieldActive) {
          runnerShieldBubbleMesh.rotation.y += 2.0 * dt;
          runnerShieldBubbleMesh.rotation.z += 1.0 * dt;
        }

        runnerBoostAuraMesh.visible = state.boostTime > 0;
        if (state.boostTime > 0) {
          runnerBoostAuraMesh.rotation.z += 5.0 * dt;
          const scale = 1.0 + Math.sin(performance.now() / 100) * 0.15;
          runnerBoostAuraMesh.scale.set(scale, scale, scale);
        }

        // Blinking visibility for invulnerable state
        if (state.invulnerableTime > 0) {
          runnerGroup.visible = Math.floor(performance.now() / 100) % 2 === 0;
        } else {
          runnerGroup.visible = true;
        }

        // 8. Collisions engine
        for (const o of activeObstacles) {
          const distZ = Math.abs(o.z - runnerGroup.position.z);
          // Collision envelope triggers
          if (distZ < 0.7) {
            const laneMatched = (o.lane === state.targetLane || Math.abs(o.mesh.position.x - runnerGroup.position.x) < 0.9);
            if (laneMatched) {
              if (o.type === 'HURDLE') {
                // Must hurdle-jump
                if (state.yPos < 0.85) {
                  triggerCrash();
                  break;
                }
              } else if (o.type === 'OVERHEAD') {
                // Must slide crouch below obstacle clearance Y=0.8
                if (!state.isSliding) {
                  triggerCrash();
                  break;
                }
              }
            }
          }
        }

        // 7d. Live Dynamic City Traffic Updates & collision handler
        activeTrafficCars.forEach((car) => {
          // Flow: LEFT cars go opposite direction of player (-z direction)
          // RIGHT cars go same direction (+z direction)
          if (car.lane === 'LEFT') {
            car.z -= car.speed * dt;
          } else {
            car.z += car.speed * dt;
          }

          // Recycle cars when they are too far behind or too far ahead of the player
          const playerZ = runnerGroup.position.z;
          if (car.lane === 'LEFT') {
            if (car.z < playerZ - 30) {
              car.z = playerZ + 150 + Math.random() * 50;
              car.mesh.position.x = -7.0; // Keep on outer left road
            }
          } else {
            if (car.z < playerZ - 30) {
              car.z = playerZ + 150 + Math.random() * 50;
              car.mesh.position.x = 7.0; // Keep on outer right road
            } else if (car.z > playerZ + 240) {
              car.z = playerZ - 20 - Math.random() * 10;
            }
          }

          // Sync mesh position
          car.mesh.position.z = car.z;

          // Soft/realism collision checks (e.g. if player wanders out of bounds to side rails)
          const distZ = Math.abs(car.z - playerZ);
          const distX = Math.abs(car.mesh.position.x - runnerGroup.position.x);
          if (distZ < 2.0 && distX < 1.4 && !state.isDead) {
            triggerCrash();
          }
        });

        // --- REAL-TIME LEVEL-OF-DETAIL (LOD) & SHADOW OPTIMIZER ---
        const playZ = runnerGroup.position.z;

        // 1. Optimize Active Traffic Cars Detail and Shadows
        for (const car of activeTrafficCars) {
          const dist = Math.abs(car.z - playZ);
          const needsDetails = dist < 70; // LOD transition boundary at 70 units
          if (car.isClose !== needsDetails) {
            car.isClose = needsDetails;
            car.mesh.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                if (child.userData.isDetail) {
                  child.visible = needsDetails;
                }
                if (!needsDetails) {
                  child.castShadow = false;
                  child.receiveShadow = false;
                } else {
                  child.castShadow = child.userData.originalCastShadow;
                  child.receiveShadow = child.userData.originalReceiveShadow;
                }
              }
            });
          }
        }

        // 2. Optimize Road Segment Buildings & Props Detail and Shadows
        for (const segment of roadSegments) {
          const dist = Math.abs(segment.z - playZ);
          const needsDetails = dist < 120; // Buildings and static props transition at 120 units
          if (segment.isClose !== needsDetails) {
            segment.isClose = needsDetails;
            
            // Toggle details and shadows for decorations (buildings, trees, lights)
            segment.decorations.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                if (child.userData.isDetail) {
                  child.visible = needsDetails;
                }
                if (!needsDetails) {
                  child.castShadow = false;
                  child.receiveShadow = false;
                } else {
                  child.castShadow = child.userData.originalCastShadow;
                  child.receiveShadow = child.userData.originalReceiveShadow;
                }
              }
            });

            // Also toggle details and shadows for sidewalk/curbs/parked cars under segment.mesh
            segment.mesh.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                if (child.userData.isDetail) {
                  child.visible = needsDetails;
                }
                if (!needsDetails) {
                  child.castShadow = false;
                  // Keep receiveShadow true so roads and sidewalks receive shadows correctly
                } else {
                  child.castShadow = child.userData.originalCastShadow !== undefined ? child.userData.originalCastShadow : true;
                }
              }
            });
          }
        }

        // 9. Premium follow camera behavior (Subway Surfers & Temple Run spacing)
        const cameraTargetZ = state.zPos - 7.5; // Farther back to capture broad lane space
        const cameraTargetY = 4.8 + state.yPos * 0.35; // Tall spectator altitude for early roadblock detection
        const cameraTargetX = runnerGroup.position.x * 0.45; // Dampened lateral drift

        camera.position.z += (cameraTargetZ - camera.position.z) * 12 * dt;
        camera.position.y += (cameraTargetY - camera.position.y) * 8 * dt;
        camera.position.x += (cameraTargetX - camera.position.x) * 10 * dt;

        // Camera consistently targeted precisely ahead of the athletic runner
        camera.lookAt(new THREE.Vector3(
          runnerGroup.position.x * 0.35,
          1.3 + state.yPos * 0.15, // Smooth visual altitude tracking for jumping
          state.zPos + 18 // Drastically extended look-ahead to keep player in the bottom-middle screen area
        ));
      } else {
        gameAudio.update(dt, false);
      }

      // Render updated frame calculations
      renderer.render(scene, camera);
    };

    const triggerCrash = () => {
      const state = stateRef.current;

      // If active speed booster or temporary invulnerability is enabled, ignore crash
      if (state.boostTime > 0 || state.invulnerableTime > 0) {
        return;
      }

      // If shield is active, consume it, grant temporary immunity, and deflect crash
      if (state.shieldActive) {
        state.shieldActive = false;
        state.invulnerableTime = 1.5; // 1.5s of flashing immunity
        gameAudio.playShieldDeflect();
        return;
      }

      state.isDead = true;
      gameAudio.playCrash();

      // Launch gorgeous slow-mo crash flip visual
      let flipElapsed = 0;
      const flipDuration = 800;
      const flipStartPos = runnerGroup.position.clone();
      const flipStartRotY = runnerGroup.rotation.y;

      const crashAnim = () => {
        flipElapsed += 16;
        const progress = Math.min(flipElapsed / flipDuration, 1.0);
        
        // Spin and fall backwards to give high impact feedback
        runnerGroup.position.z = flipStartPos.z;
        runnerGroup.position.y = flipStartPos.y + Math.sin(progress * Math.PI) * 1.2 - (0.4 * progress);
        runnerGroup.rotation.x = -progress * Math.PI; // Full forward tumble
        runnerGroup.rotation.y = flipStartRotY + progress * Math.PI * 0.5;

        if (runnerGroup.position.y < 0.05) {
          runnerGroup.position.y = 0.05;
        }

        if (progress < 1.0) {
          requestAnimationFrame(crashAnim);
        } else {
          // Triggers final scoring UI panel
          onGameOver(state.score, state.distance, state.coins);
        }
      };

      crashAnim();
    };

    // Begin looping
    gameLoop();

    // --- CLEANUP (Prevent memory leaks on components unmounting) ---
    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      window.removeEventListener('keydown', handleKeyDown);
      if (canvasEl) {
        canvasEl.removeEventListener('touchstart', handleTouchStart);
        canvasEl.removeEventListener('touchmove', handleTouchMove);
        canvasEl.removeEventListener('touchend', handleTouchEnd);
      }

      // Dispose of active elements
      scene.clear();
      renderer.dispose();
      coinGeom.dispose();
      coinMat.dispose();
      asphaltMat.dispose();
      laneLineMat.dispose();
      curbMat.dispose();
      sidewalkMat.dispose();
      skinMaterial.dispose();
      shirtMaterial.dispose();
      pantsMaterial.dispose();
      shoeMaterial.dispose();
      visorMaterial.dispose();
      windowGlowMat.dispose();
      buildingMaterials.forEach(m => m.dispose());
      glassSkyscraperMat.dispose();
      steelFrameMat.dispose();
      woodMat.dispose();
      darkMetalMat.dispose();
      hydrantRedMat.dispose();
      leafMat.dispose();
      leafSecondaryMat.dispose();
      trunkMat.dispose();
      streetLightGlowMat.dispose();
      coneMat.dispose();
      streetLightPoolMat.dispose();
    };
  }, [gameState]); // Re-initialize only if main game structure switches radically

  return (
    <div ref={containerRef} className="w-full h-full relative bg-slate-900 rounded-3xl overflow-hidden select-none">
      <canvas ref={canvasRef} id="game-canvas" className="w-full h-full block focus:outline-none touch-none" />
    </div>
  );
}
