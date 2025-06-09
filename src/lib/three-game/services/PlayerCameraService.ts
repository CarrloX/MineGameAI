import * as THREE from "three";
import type { PlayerCameraService } from "../types";

export class PlayerCameraController {
  private cameraService: PlayerCameraService;
  private player: any; // Referencia al jugador

  constructor(cameraService: PlayerCameraService, player: any) {
    this.cameraService = cameraService;
    this.player = player;
  }

  public lookAround(): void {
    const maxPitch = Math.PI / 2 - 0.01;
    this.player.pitch = Math.max(
      -maxPitch,
      Math.min(maxPitch, this.player.pitch)
    );
    this.player.yaw =
      ((this.player.yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

    this.cameraService.rotation.x = this.player.pitch;
    this.cameraService.rotation.y = this.player.yaw;
  }

  public updatePosition(): void {
    this.cameraService.position.set(
      this.player.x,
      this.player.y + this.player.height * 0.9,
      this.player.z
    );
  }

  public getCamera(): PlayerCameraService {
    return this.cameraService;
  }

  public setPitch(pitch: number): void {
    this.player.pitch = pitch;
    this.lookAround();
  }

  public setYaw(yaw: number): void {
    this.player.yaw = yaw;
    this.lookAround();
  }

  public getPitch(): number {
    return this.player.pitch;
  }

  public getYaw(): number {
    return this.player.yaw;
  }

  public setPosition(x: number, y: number, z: number): void {
    this.cameraService.position.set(x, y, z);
  }

  public setRotation(pitch: number, yaw: number): void {
    this.player.pitch = pitch;
    this.player.yaw = yaw;
    this.lookAround();
  }
}
