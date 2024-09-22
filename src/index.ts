import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  CharacteristicValue,
  HAPStatus,
} from "homebridge";
import axios from "axios";

const PLUGIN_NAME = "HomebridgeVektivaPlugin";
const PLATFORM_NAME = "VektivaPlatform";

class VektivaPlatform implements DynamicPlatformPlugin {
  private readonly log: Logger;
  public readonly api: API; // Changed from protected to public
  private readonly accessories: PlatformAccessory[] = [];

  private readonly remoteId: string;
  private readonly apiKey: string;
  private readonly deviceId: string;
  private readonly apiBaseUrl: string;

  constructor(log: Logger, config: PlatformConfig, api: API) {
    this.log = log;
    this.api = api;

    this.remoteId = config.remoteId;
    this.apiKey = config.apiKey;
    this.deviceId = config.deviceId;
    this.apiBaseUrl = `https://vektiva.online/api/${this.remoteId}/${this.apiKey}/${this.deviceId}`;

    this.api.on("didFinishLaunching", () => {
      this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.accessories.push(accessory);
  }

  discoverDevices() {
    const uuid = this.api.hap.uuid.generate(this.deviceId);
    const existingAccessory = this.accessories.find(
      (accessory) => accessory.UUID === uuid,
    );

    if (existingAccessory) {
      this.configureExistingAccessory(existingAccessory);
    } else {
      this.addNewAccessory(uuid);
    }
  }

  configureExistingAccessory(accessory: PlatformAccessory) {
    this.log.info(
      "Restoring existing accessory from cache:",
      accessory.displayName,
    );
    new VektivaSwitch(this, accessory);
  }

  addNewAccessory(uuid: string) {
    this.log.info("Adding new accessory");
    const accessory = new this.api.platformAccessory("Vektiva Switch", uuid);
    new VektivaSwitch(this, accessory);
    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
      accessory,
    ]);
  }

  async makeApiRequest(command: string): Promise<boolean> {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/${command}`);
      return response.data === "OK";
    } catch (error) {
      this.log.error("API request failed:", error);
      return false;
    }
  }
}

class VektivaSwitch {
  private service: Service;

  constructor(
    private readonly platform: VektivaPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.accessory
      .getService(this.platform.api.hap.Service.AccessoryInformation)!
      .setCharacteristic(
        this.platform.api.hap.Characteristic.Manufacturer,
        "Vektiva",
      )
      .setCharacteristic(this.platform.api.hap.Characteristic.Model, "Switch")
      .setCharacteristic(
        this.platform.api.hap.Characteristic.SerialNumber,
        "Default-Serial",
      );

    this.service =
      this.accessory.getService(this.platform.api.hap.Service.Switch) ||
      this.accessory.addService(this.platform.api.hap.Service.Switch);

    this.service.setCharacteristic(
      this.platform.api.hap.Characteristic.Name,
      "Vektiva Switch",
    );

    this.service
      .getCharacteristic(this.platform.api.hap.Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));
  }

  async setOn(value: CharacteristicValue): Promise<void> {
    const isOn = value as boolean;
    const command = isOn ? "on" : "off";
    const success = await this.platform.makeApiRequest(command);
    if (!success) {
      throw new this.platform.api.hap.HapStatusError(
        HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  async getOn(): Promise<CharacteristicValue> {
    const success = await this.platform.makeApiRequest("status");
    return success;
  }
}

export default (api: API) => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, VektivaPlatform);
};
