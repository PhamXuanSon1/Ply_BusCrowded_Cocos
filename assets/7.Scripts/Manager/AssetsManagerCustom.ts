import { _decorator, Component, Material, Mesh, Node, resources } from "cc";
const { ccclass, property } = _decorator;

@ccclass("AssetsManager")
export class AssetsManagerCustom extends Component {
  static instance: AssetsManagerCustom = null!;
  static get ins() {
    if (!this.instance) {
      this.instance = new AssetsManagerCustom();
    }
    return this.instance;
  }

  assetInfos: Map<string, any> = new Map();

  async loadAssetsAsync(path: string, type: any): Promise<any[]> {
    return new Promise((resolve, reject) => {
      resources.loadDir(path, type, (err, assets) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(assets);
      });
    });
  }

  async loadModelsAndMaterials() {
    try {
      // Tải toàn bộ tài nguyên trong thư mục Models
      const meshes = await this.loadAssetsAsync("8.Models", Mesh);
      meshes.forEach((asset) => {
        let path = MeshInfos.find((info) => asset._uuid === info.uuid)?.path;
        this.assetInfos.set(path, asset);
      });

      const materials = await this.loadAssetsAsync("8.Models", Material);
      materials.forEach((asset) => {
        let path = MaterialInfos.find(
          (info) => asset._uuid === info.uuid
        )?.path;
        this.assetInfos.set(path, asset);
      });
    } catch (err) {
      console.error("Failed to load assets:", err);
    }
  }
  

  async onLoad() {
    AssetsManagerCustom.instance = this;

    // const mesh = resources.getDirWithPath("8.Models", Mesh).map((asset) => {
    //   return {
    //     path: asset.path,
    //     uuid: asset.uuid,
    //   };
    // });
    // console.log(JSON.stringify(mesh));

    // const mat = resources.getDirWithPath("8.Models", Material).map((asset) => {
    //   return {
    //     path: asset.path,
    //     uuid: asset.uuid,
    //   };
    // });
    // console.log(JSON.stringify(mat));

    await this.loadModelsAndMaterials();
  }

  start() {}

  update(deltaTime: number) {}
}

export const MeshInfos = [
  // {
  //   path: "8.Models/Models/Zipper/Mesh_1",
  //   uuid: "a31ea442-5c73-4de6-9873-55c0436f9177@c2cb8",
  // },
  // {
  //   path: "8.Models/Models/Zipper/Mesh_2",
  //   uuid: "a31ea442-5c73-4de6-9873-55c0436f9177@2fb5d",
  // },
  // {
  //   path: "8.Models/Models/Zipper/Mesh_0",
  //   uuid: "a31ea442-5c73-4de6-9873-55c0436f9177@ef8a8",
  // },
];

const MaterialInfos = [
  // {
  //   path: "8.Models/Mats/Bag/Bag",
  //   uuid: "939b09d1-f57f-4fbb-8626-22ec8b64a95e",
  // },
  // {
  //   path: "8.Models/Mats/Handle/Handle",
  //   uuid: "d40a9527-3e43-4667-aa8d-cf50d70c7592",
  // },
  // {
  //   path: "8.Models/Mats/Tail/Tail-001",
  //   uuid: "50007675-404e-4c67-b0ee-26d6e9211eca",
  // },
  // {
  //   path: "8.Models/Mats/Tail/Tail",
  //   uuid: "64a2efed-5ecb-4545-8b9b-bb51114a49b6",
  // },
  // {
  //   path: "8.Models/Mats/Tooth/Tooth-001",
  //   uuid: "839accda-e64c-4514-ad27-0dbd4152d542",
  // },
  // {
  //   path: "8.Models/Mats/Tooth/Tooth",
  //   uuid: "dd7a0e68-e913-44e5-b91d-9b24629d319d",
  // },
  // {
  //   path: "8.Models/Mats/Bag/Bag-001",
  //   uuid: "cf85cbed-d482-4a1f-bcf7-fc30bf23ae73",
  // },
  // {
  //   path: "8.Models/Mats/Bag/Bag-002",
  //   uuid: "7b330212-a75f-4e5f-adb4-b0c745db526d",
  // },
  // {
  //   path: "8.Models/Mats/Handle/Handle-001",
  //   uuid: "ce1358ec-ecca-4ec3-9b61-fb7107baf8bb",
  // },
  // {
  //   path: "8.Models/Mats/Handle/Handle-002",
  //   uuid: "1ba2770d-f4b0-4ed3-b827-1c9a3243cc04",
  // },
];
