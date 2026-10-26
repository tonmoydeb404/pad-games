/** Every extracted engine method, merged into one object that becomes JeepEngine's prototype methods. */
import * as worldTrail from "./world/trail";
import * as worldTerrainHeight from "./world/terrain-height";
import * as worldTerrainBuild from "./world/terrain-build";
import * as worldSigns from "./world/signs";
import * as worldRenderInit from "./world/render-init";
import * as worldScatter from "./world/scatter";
import * as worldJungle from "./world/jungle";
import * as worldJungleTrees from "./world/jungle-trees";
import * as worldJungleUndergrowth from "./world/jungle-undergrowth";
import * as worldAtmosphere from "./world/atmosphere";
import * as worldBuild from "./world/build";
import * as worldBuildSystems from "./world/build-systems";
import * as worldBuildAnimals from "./world/build-animals";
import * as vehicleJeepParts from "./vehicle/jeep-parts";
import * as vehicleJeepWheel from "./vehicle/jeep-wheel";
import * as vehicleJeepUndercarriage from "./vehicle/jeep-undercarriage";
import * as vehicleJeepInterior from "./vehicle/jeep-interior";
import * as vehicleJeepBodyShell from "./vehicle/jeep-body-shell";
import * as vehicleJeepBodyFront from "./vehicle/jeep-body-front";
import * as vehicleJeepBodyCabin from "./vehicle/jeep-body-cabin";
import * as vehicleJeepBody from "./vehicle/jeep-body";
import * as vehicleRig from "./vehicle/vehicle-rig";
import * as vehicleDebris from "./vehicle/debris";
import * as vehicleReset from "./vehicle/reset";
import * as vehicleUpdateVehicle from "./vehicle/update-vehicle";
import * as vehicleVehicleStep from "./vehicle/vehicle-step";
import * as vehicleVehiclePose from "./vehicle/vehicle-pose";
import * as vehicleVehicleFx from "./vehicle/vehicle-fx";
import * as vehicleEvents from "./vehicle/events";
import * as vehicleParticles from "./vehicle/particles";
import * as playerCarTransition from "./player/car-transition";
import * as playerUpdateExplorer from "./player/update-explorer";
import * as playerExplorerMove from "./player/explorer-move";
import * as playerExplorerAnim from "./player/explorer-anim";
import * as playerRide from "./player/ride";
import * as playerRideUpdate from "./player/ride-update";
import * as playerWeapons from "./player/weapons";
import * as playerFire from "./player/fire";
import * as playerMelee from "./player/melee";
import * as playerFootCamera from "./player/foot-camera";
import * as cameraCamera from "./camera/camera";
import * as uiHud from "./ui/hud";
import * as uiHudUpdate from "./ui/hud-update";
import * as runtimeLifecycle from "./runtime/lifecycle";
import * as runtimeAnimate from "./runtime/animate";
import * as runtimeFrameActions from "./runtime/frame-actions";
import * as runtimeFrameSteps from "./runtime/frame-steps";
import * as runtimeFrameRender from "./runtime/frame-render";
import * as playerInventoryActions from "./player/inventory-actions";
import * as runtimeHandlers from "./runtime/handlers";
import * as runtimeTitle from "./runtime/title";
import * as worldInitWorld from "./world/init-world";

/** Method modules are plain functions taking the engine as `this`; see jeep-engine.ts. */
export const ENGINE_METHODS = {
  ...worldTrail,
  ...worldTerrainHeight,
  ...worldTerrainBuild,
  ...worldSigns,
  ...worldRenderInit,
  ...worldScatter,
  ...worldJungle,
  ...worldJungleTrees,
  ...worldJungleUndergrowth,
  ...worldAtmosphere,
  ...worldBuild,
  ...worldBuildSystems,
  ...worldBuildAnimals,
  ...vehicleJeepParts,
  ...vehicleJeepWheel,
  ...vehicleJeepUndercarriage,
  ...vehicleJeepInterior,
  ...vehicleJeepBodyShell,
  ...vehicleJeepBodyFront,
  ...vehicleJeepBodyCabin,
  ...vehicleJeepBody,
  ...vehicleRig,
  ...vehicleDebris,
  ...vehicleReset,
  ...vehicleUpdateVehicle,
  ...vehicleVehicleStep,
  ...vehicleVehiclePose,
  ...vehicleVehicleFx,
  ...vehicleEvents,
  ...vehicleParticles,
  ...playerCarTransition,
  ...playerUpdateExplorer,
  ...playerExplorerMove,
  ...playerExplorerAnim,
  ...playerRide,
  ...playerRideUpdate,
  ...playerWeapons,
  ...playerFire,
  ...playerMelee,
  ...playerFootCamera,
  ...cameraCamera,
  ...uiHud,
  ...uiHudUpdate,
  ...runtimeLifecycle,
  ...runtimeAnimate,
  ...runtimeFrameActions,
  ...runtimeFrameSteps,
  ...runtimeFrameRender,
  ...playerInventoryActions,
  ...runtimeHandlers,
  ...runtimeTitle,
  ...worldInitWorld,
};
