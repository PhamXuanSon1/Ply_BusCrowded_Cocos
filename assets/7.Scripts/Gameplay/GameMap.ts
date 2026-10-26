import { _decorator, Component, Enum, Node } from 'cc';
import { Line2D } from '../../Misc/Line2D/Line2D';
import { Line3DRing } from '../../Misc/Line2D/Line3DRing';
const { ccclass, property } = _decorator;

// Kiểu gameplay của map:
// - Ring3D: người chạy trên đường xoắn ốc Line3DRing, qua lối ra thì lên xe (V37).
// - RingFeeder: ring Line2D khép kín quay vòng, 2 hàng chờ Line2D đổ row vào ô trống của ring,
//   row ở vùng chính diện cùng màu xe trong slot thì lên xe (main / V36).
export enum MapKind { Ring3D, RingFeeder }
Enum(MapKind);

const G_MAP = { name: "Map", id: "map", displayOrder: 1, style: "section" };
const G_RING3D = { name: "Ring xoắn ốc (Ring3D)", id: "ring3d", displayOrder: 2, style: "section" };
const G_FEEDER = { name: "Ring + 2 hàng chờ (RingFeeder)", id: "feeder", displayOrder: 3, style: "section" };

/**
 * Gắn ở node gốc của mỗi prefab map (5.Prefabs/Map/Map_*.prefab). Giữ tham chiếu tới đường đi trong
 * prefab + các thông số gameplay phụ thuộc hình dạng map, nên đổi map (MapManager) là Game tự dùng
 * đúng đường + thông số của map đó, không phải chỉnh lại Game.
 */
@ccclass('GameMap')
export class GameMap extends Component {
    @property({ group: G_MAP, type: MapKind, tooltip: "Kiểu gameplay của map:\n- Ring3D: người chạy trên Line3DRing (V37).\n- RingFeeder: ring Line2D quay + 2 hàng chờ Line2D (main / V36)." })
    kind: MapKind = MapKind.Ring3D;
    @property({ group: G_MAP, tooltip: "Góc nghiêng (độ, quanh trục X) của node Gameplay lúc chạy game." })
    tilt: number = -30;
    @property({ group: G_MAP, tooltip: "Bật: lúc chạy game đặt WCam theo Camera Y / Ortho Height của map này.\nTắt: giữ nguyên WCam trong scene." })
    overrideCamera: boolean = false;
    @property({ group: G_MAP, visible() { return this.overrideCamera; }, tooltip: "Vị trí Y (local) của WCam khi dùng map này." })
    cameraY: number = -1.371;
    @property({ group: G_MAP, visible() { return this.overrideCamera; }, tooltip: "Ortho Height của WCam khi dùng map này." })
    orthoHeight: number = 11;

    // ---- Ring3D ----
    @property({ group: G_RING3D, type: Line3DRing, visible() { return this.kind == MapKind.Ring3D; }, tooltip: "Đường xoắn ốc (component Line3DRing) mà người chạy vòng.\n- Row đi qua lối ra (exitFromPoint → exitToPoint của Line3DRing) mà cùng màu xe đang đỗ trong slot thì xuống lên xe.\n- Tới cuối đường thì thu nhỏ rồi hiện lại ở đầu vào." })
    line3DRing: Line3DRing = null;
    @property({ group: G_RING3D, type: [Node], visible() { return this.kind == MapKind.Ring3D; }, tooltip: "Các điểm người đi qua theo thứ tự sau khi rời lối ra của ring, rồi mới đi vào xe.\nĐể trống = đi thẳng từ lối ra tới xe." })
    exitPoints: Node[] = [];
    @property({ group: G_RING3D, visible() { return this.kind == MapKind.Ring3D; }, tooltip: "Tốc độ chạy của row trên ring (đơn vị local của Line3DRing / giây).\nCũng quyết định nhịp người đi qua lối ra lên xe." })
    ringSpeed: number = 1;
    @property({ group: G_RING3D, visible() { return this.kind == MapKind.Ring3D; }, tooltip: "Khoảng cách giữa 2 row liên tiếp trên ring (đơn vị local Line3DRing).\nSố ô = chiều dài đường / giá trị này → lớn hơn = ít người hơn, nhẹ hơn (mỗi người là 1 sprite/mesh)." })
    ringRowSpacing: number = 0.45;
    @property({ group: G_RING3D, visible() { return this.kind == MapKind.Ring3D; }, tooltip: "Khoảng cách ngang giữa 2 người cạnh nhau trong row (đơn vị local Line3DRing).\nĐổi giá trị này thì bề ngang đường Line3DRing cũng đổi theo." })
    ringLaneGap: number = 0.3;
    @property({ group: G_RING3D, range: [0, 1, 0.05], slide: true, visible() { return this.kind == MapKind.Ring3D; }, tooltip: "Tỉ lệ ô trên ring có sẵn người lúc bắt đầu (0..1).\n1 = kín đường ngay từ đầu; nhỏ hơn thì phần trống được lấp dần ở đầu vào khi ring chạy." })
    ringPrefill: number = 1;
    @property({ group: G_RING3D, visible() { return this.kind == MapKind.Ring3D; }, tooltip: "Phóng to người trên ring so với người ở node Human (chỗ người đi ra xe).\n1 = cùng cỡ thế giới." })
    ringHumanScale: number = 1.2;
    @property({ group: G_RING3D, visible() { return this.kind == MapKind.Ring3D; }, tooltip: "Quãng đường (local Line3DRing) mà row thu nhỏ dần ở cuối đường và hiện dần ở đầu vào khi quay vòng.\n0 = biến mất / hiện ra tức thì." })
    ringFade: number = 0.6;

    @property({ group: G_MAP, tooltip: "Chiều chạy của ring:\n- Ring3D: bật = từ point cuối về point 0, tắt = từ point 0 tới point cuối.\n- RingFeeder: đảo chiều quay vòng ring." })
    ringReverse: boolean = true;

    // ---- RingFeeder ----
    @property({ group: G_FEEDER, type: Line2D, visible() { return this.kind == MapKind.RingFeeder; }, tooltip: "Hàng chờ trái (người xếp theo -Y)." })
    line2D: Line2D = null;
    @property({ group: G_FEEDER, type: Line2D, visible() { return this.kind == MapKind.RingFeeder; }, tooltip: "Hàng chờ phải." })
    line2D2: Line2D = null;
    @property({ group: G_FEEDER, type: Line2D, visible() { return this.kind == MapKind.RingFeeder; }, tooltip: "Đường ring khép kín (điểm cuối trùng điểm đầu) mà các row quay vòng theo." })
    ringLine2D: Line2D = null;
    @property({ group: G_FEEDER, type: Node, visible() { return this.kind == MapKind.RingFeeder; }, tooltip: "Tâm ring: row trên ring luôn quay mặt về điểm này.\nĐể trống = trung bình cộng các Point của Ring Line2D." })
    ringOrigin: Node = null;
    @property({ group: G_FEEDER, visible() { return this.kind == MapKind.RingFeeder; }, tooltip: "Số slot cố định trên ring." })
    ringSlotCount: number = 40;
    @property({ group: G_FEEDER, visible() { return this.kind == MapKind.RingFeeder; }, tooltip: "Số giây để ring quay hết 1 vòng." })
    ringRevolveSeconds: number = 10;
    @property({ group: G_FEEDER, visible() { return this.kind == MapKind.RingFeeder; }, tooltip: "Góc (độ) cộng thêm vào góc mỗi slot để bù lệch giữa slot 0 và vị trí chính diện / feed thực tế." })
    ringAngleOffset: number = 180;
    @property({ group: G_FEEDER, visible() { return this.kind == MapKind.RingFeeder; }, tooltip: "Góc bắt đầu vùng chính diện (row ở đây cùng màu xe trong slot thì lên xe)." })
    ringFrontAngleMin: number = 349;
    @property({ group: G_FEEDER, visible() { return this.kind == MapKind.RingFeeder; }, tooltip: "Góc kết thúc vùng chính diện (có thể cắt qua mốc 0°)." })
    ringFrontAngleMax: number = 15;
    @property({ group: G_FEEDER, visible() { return this.kind == MapKind.RingFeeder; }, tooltip: "Góc slot nhận row từ hàng chờ trái." })
    leftFeedAngle: number = 257;
    @property({ group: G_FEEDER, visible() { return this.kind == MapKind.RingFeeder; }, tooltip: "Góc slot nhận row từ hàng chờ phải." })
    rightFeedAngle: number = 115;
    @property({ group: G_FEEDER, visible() { return this.kind == MapKind.RingFeeder; }, tooltip: "Sai số (±độ) quanh Left Feed Angle để được feed." })
    leftFeedAngleTolerance: number = 15;
    @property({ group: G_FEEDER, visible() { return this.kind == MapKind.RingFeeder; }, tooltip: "Sai số (±độ) quanh Right Feed Angle để được feed." })
    rightFeedAngleTolerance: number = 15;
    @property({ group: G_FEEDER, visible() { return this.kind == MapKind.RingFeeder; }, tooltip: "Khoảng cách giữa các row trên hàng chờ (quyết định số row mỗi hàng)." })
    rowLineSpacing: number = 0.25;
    @property({ group: G_FEEDER, visible() { return this.kind == MapKind.RingFeeder; }, tooltip: "Căn tâm row (không phải người đầu tiên) vào đúng path — áp dụng cho cả ring lẫn 2 hàng chờ." })
    rowCentered: boolean = true;
    @property({ group: G_FEEDER, visible() { return this.kind == MapKind.RingFeeder; }, tooltip: "Số row màu Start Pink Color xếp thành 1 dải liền nhau trên ring ngay lúc vào game (0 = tắt)." })
    startPinkRows: number = 0;
    @property({ group: G_FEEDER, visible() { return this.kind == MapKind.RingFeeder && this.startPinkRows > 0; }, tooltip: "Màu (index trong bảng màu xe/người) của dải đầu game." })
    startPinkColor: number = 4;
    @property({ group: G_FEEDER, visible() { return this.kind == MapKind.RingFeeder && this.startPinkRows > 0; }, tooltip: "Góc (độ) tâm của dải lúc bắt đầu — 0 = đỉnh ring, 180 = chính diện." })
    startPinkAngle: number = 180;
}
