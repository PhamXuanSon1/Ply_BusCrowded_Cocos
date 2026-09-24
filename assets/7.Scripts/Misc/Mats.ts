import { _decorator, CCObject, Color, color, Component, EventHandler, instantiate, JsonAsset, Material, MeshRenderer, Node, v2, v3, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('Mats')
export class Mats extends Component {

    @property({
        readonly: true,
        tooltip: "Click Recompile to apply changes. Click Demo to see model with applied materials. Click Log Data to export adjusted data to json file. Click Apply Data to load data from json file."
    })
    dragMouseHearToSeeGuide: boolean = false;

    get recompile() { return false; }
    @property 
    set recompile(v: boolean) {
        this.init();
        if(this.demo) {
            this.demo = true;
        }
    }

    _demo: boolean = false
    @property
    dis = v2(1, 1);
    get demo() { return this._demo; }
    @property 
    set demo(v: boolean) {
        if(!this.inited) this.init();
        this._demo = v;
        let parent = this.node.getChildByName("Demo");
        if(v == false) {
            if(parent) parent.active = false;
            return;
        } 

        let template = this.node.getChildByName("Template");
        let size = v2(this.colors.length, 10);
        if(template && parent) {
            parent.active = true;
            let meshes = [...parent.children];
            for(let i = 0; i < size.x; i++) {
                for(let j = 0; j < size.y; j++) {
                    let mesh = meshes.shift();
                    if(!mesh) mesh = instantiate(template);
                    mesh.parent = parent;
                    mesh.active = true;
                    mesh.position = v3((i - size.x/2 + 0.5) * this.dis.x, -j * this.dis.y);
                    mesh.name = "Color_" + i + "_index_" + j; 
                    mesh._objFlags = CCObject.Flags.DontSave 
                    | CCObject.Flags.HideInHierarchy;
                    // mesh.setSharedMaterial(this.mats[i], 0);
                    mesh.getComponentsInChildren(MeshRenderer).forEach(m => m.setSharedMaterial(this.mats[i], 0));
                }
            }
            meshes.forEach(m => m.destroy());
        }
    }

    @property
    fileName: string = "Box";
    get logData() { return false; }
    @property 
    set logData(v: boolean) {
        let keys = [
            "colors", 
            "clamBrightness", 
            "brightness", 
            "contrast", 
            "saturation", 
            "hue", 
            "roughness", 
            "metallic", 
            "specularIntensity", 
            "fixedLighting", 
            "jamLighting", 
            "selfEmissive", 
            "emissive", 
            "emissiveScale", 
            "useOutline", 
            "lineWidth",
            "dis"
        ]
        let data = {};
        keys.forEach(k => data[k] = this[k]);
        data["colors"] = this.colors.map(c => c.toHEX());
        data["emissive"] = this.emissive.toHEX();
        console.log(JSON.stringify(data));
        downloadJson(data, this.fileName + "MatData.json");
    }

    @property(JsonAsset)
    jsonData: JsonAsset = null!
    @property ({
        visible() {
            return this.jsonData !== null
        },
    })
    get applyData() { return false; }
    set applyData(v: boolean) {
        let keys = Object.keys(this.jsonData.json);
        keys.forEach(k => {
            this[k] = this.jsonData.json[k];
        });
        this.colors = this.jsonData.json["colors"].map(c => color().fromHEX(c));
        this.emissive = color().fromHEX(this.jsonData.json["emissive"]);
        this.dis = v2(this.jsonData.json["dis"].x, this.jsonData.json["dis"].y);
        this.init();
    }

    @property(Material)
    mat: Material = null!;
    mats: Material[] = [];
    @property([Color])
    colors: Color[] = [];

    @property
    clamBrightness: boolean = true;  
    @property({slide: true, range: [-1, 1], step: 0.01})
    brightness: number = 0;
    @property({slide: true, range: [0, 2], step: 0.01})
    contrast: number = 0;
    @property({slide: true, range: [-10, 10], step: 0.01})
    saturation: number = 1;
    @property({slide: true, range: [-180, 180], step: 1})
    hue: number = 0;
    @property({slide: true, range: [0, 1], step: 0.01})
    roughness: number = 0.9;
    @property({slide: true, range: [0, 1], step: 0.01})
    metallic: number = 0.6;
    @property({slide: true, range: [0, 1], step: 0.01})
    specularIntensity: number = 1;
    @property
    fixedLighting: boolean = false;  
    @property({tooltip: "Chiếu sáng kiểu BusJamBase (dùng với metallic 1, roughness 1): màu ra gần đúng màu chọn"})
    jamLighting: boolean = false;


    // emissive
    @property
    selfEmissive: boolean = false;  
    @property({visible() {
        return this.selfEmissive == false
    },})
    emissive: Color = color();
    @property({slide: true, range: [0, 10], step: 0.01})
    emissiveScale: number = 1;

    // glow
    @property
    enableGlow: boolean = false;  
    @property({visible() {
        return this.enableGlow
    }})
    selfGlow: boolean = false;
    @property({visible() {
        return this.selfGlow == false
    }})
    glowColor: Color = color();
    @property({slide: true, range: [-1, 1], step: 0.01})
    glowDark: number = 0;

    // outline
    @property
    useOutline: boolean = true;   
    @property({slide: true, range: [0, 1000], step: 0.01, visible() {
        return this.useOutline
    },})
    lineWidth: number = 10;


    changeColor() {
        console.log("set color to mats");        
        this.mats.forEach((m, i) => {

            m.setProperty("brightness", this.brightness);
            m.setProperty("contrast", this.contrast);
            m.setProperty("saturation", this.saturation);
            m.setProperty("hue", this.hue);

            let c = this.colors[i].clone();
            m.setProperty("mainColor", c)

            // outline color
            let a = this.colors[i].clone();
            let dt = 150;
            if(a.r > dt) a.r -= dt; else a.r = 20;
            if(a.g > dt) a.g -= dt; else a.g = 20;
            if(a.b > dt) a.b -= dt; else a.b = 20;
            m.setProperty("baseColor", a)

            // m.setProperty("mainTexture", null);    
            // m.setProperty("pbrMap", null);
            
            m.setProperty("roughness", this.roughness);
            m.setProperty("metallic", this.metallic);
            m.setProperty("specularIntensity", this.specularIntensity);

            m.setProperty("emissiveScale", v3(1, 1, 1).multiplyScalar(this.emissiveScale));
            let em = this.selfEmissive ? c : this.emissive;
            m.setProperty("emissive", em);

            let gl = this.selfGlow ? c.clone() : this.glowColor.clone();
            let ad = AdjustSaturation(v3(gl.r / 255, gl.g / 255, gl.b / 255), this.saturation).multiplyScalar(255);
            gl = color(ad.x, ad.y, ad.z, 255);

            gl.r += this.glowDark * 255;
            if(gl.r > 255) gl.r = 255; 
            if(gl.r < 0) gl.r = 0;
            gl.g += this.glowDark * 255;
            if(gl.g > 255) gl.g = 255;
            if(gl.g < 0) gl.g = 0;
            gl.b += this.glowDark * 255;
            if(gl.b > 255) gl.b = 255;
            if(gl.b < 0) gl.b = 0;
            m.setProperty("glowColor", gl);

            m.setProperty("lineWidth", this.lineWidth);

            
        });
        
    }

    inited: boolean = false;
    @property([EventHandler])
    onColorChangeds: EventHandler[] = [];
    init(colors: Color[] = this.colors) {
        this.colors = colors;
        this.inited = true;
        this.mats = [];
        this.colors.forEach((c, i) => {
            let m = new Material();
            m.copy(this.mat
            // custom define-marcos
            ,   {
                    defines: {
                        USE_OUTLINE_PASS: this.useOutline,
                        FIXED_LIGHTING : this.fixedLighting,
                        JAM_LIGHTING: this.jamLighting,
                        CLAMP_BRIGHTNESS : this.clamBrightness,
                        ENABLE_GLOW: this.enableGlow
                    }
                }
            );
            this.mats.push(m);
        })       
        this.changeColor();
        if(this.inited) {
            this.onColorChangeds.forEach((e) => e.emit([]));
        } 

        // let keys = Object.keys(this);
        // console.log(keys);
        // this.logData = true;
        
    }

    update(deltaTime: number) {
        
    }
}

export function AdjustSaturation(color: Vec3, sat: number) {
    let gray = Vec3.dot(color, v3(0.299, 0.587, 0.114));
    // return mix(vec3(gray), color, sat);
    return Vec3.lerp(v3(), v3(gray, gray, gray), color, sat);
}


function downloadJson(data: any, fileName: string = "data.json") {
    const jsonString = JSON.stringify(data, null, 2);

    const blob = new Blob([jsonString], {
        type: "application/json"
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.style.display = "none";

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
}