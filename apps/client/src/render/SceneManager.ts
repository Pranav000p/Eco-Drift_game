import * as THREE from 'three';
import { GAME_CONSTANTS } from '@echo-drift/shared';

export class SceneManager {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;

  private cameraTarget: THREE.Vector3 = new THREE.Vector3();
  private baseFov: number = 68;

  constructor(canvas: HTMLCanvasElement) {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(GAME_CONSTANTS.PALETTE.BACKGROUND);
    this.scene.fog = new THREE.FogExp2(GAME_CONSTANTS.PALETTE.BACKGROUND, 0.012);

    // Camera
    const aspect = window.innerWidth / window.innerHeight;
    this.updateBaseFov(aspect);
    this.camera = new THREE.PerspectiveCamera(this.baseFov, aspect, 0.1, 400);
    this.camera.position.set(0, 1.8, -4.5);

    // Ambient light (very dim — world is mostly emissive/additive)
    const ambient = new THREE.AmbientLight(0x111122, 0.3);
    this.scene.add(ambient);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;

    window.addEventListener('resize', this.onResize.bind(this));
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.onResize(), 100);
    });
  }

  private updateBaseFov(aspect: number) {
    if (aspect < 1.0) {
      // In portrait, maintain comfortable horizontal viewing angle
      const targetHFovRad = (75 * Math.PI) / 180;
      const vFovRad = 2 * Math.atan(Math.tan(targetHFovRad / 2) / aspect);
      this.baseFov = Math.min(94, Math.max(68, (vFovRad * 180) / Math.PI));
    } else {
      this.baseFov = 68;
    }
  }

  private onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspect = width / height;
    this.updateBaseFov(aspect);
    this.camera.aspect = aspect;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  }

  /**
   * Smooth chase camera following the vessel through the tunnel, adapted for landscape and portrait.
   */
  public updateCamera(vesselPos: THREE.Vector3, vesselRot: THREE.Euler, speedRatio: number, dt: number) {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const isPortrait = aspect < 1.0;

    const camYOffset = isPortrait ? 2.3 : 2.0;
    const camZOffset = isPortrait ? -6.2 : -5.0;

    const targetCamX = vesselPos.x * 0.7;
    const targetCamY = vesselPos.y * 0.7 + camYOffset;
    const targetCamZ = vesselPos.z + camZOffset;

    const smoothFactor = Math.min(1.0, dt * 8);
    this.camera.position.x += (targetCamX - this.camera.position.x) * smoothFactor;
    this.camera.position.y += (targetCamY - this.camera.position.y) * smoothFactor;
    this.camera.position.z += (targetCamZ - this.camera.position.z) * smoothFactor;

    // Look ahead of vessel
    this.cameraTarget.set(vesselPos.x * 0.85, vesselPos.y * 0.85 + (isPortrait ? 0.4 : 0.3), vesselPos.z + 15.0);
    this.camera.lookAt(this.cameraTarget);

    // Camera roll banking
    this.camera.rotation.z = vesselRot.z * 0.25;

    // Dynamic FOV speed warp
    const targetFov = this.baseFov + speedRatio * 10.0;
    this.camera.fov += (targetFov - this.camera.fov) * smoothFactor;
    this.camera.updateProjectionMatrix();
  }

  public render() {
    this.renderer.render(this.scene, this.camera);
  }
}
