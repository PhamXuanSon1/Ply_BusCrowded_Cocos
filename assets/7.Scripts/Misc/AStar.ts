import { Director, director, game, Vec2 } from 'cc';
import Ulis from './Ulis';

export function getNeightbors(grid: Vec2, mapSize: Vec2) {
    let neighbors: Vec2[] = [];
    let directions = [
        new Vec2(0, 1),   // Up
        // new Vec2(-1, 1),  // Up-Left
        new Vec2(-1, 0),  // Left
        // new Vec2(-1, -1), // Down-Left
        new Vec2(0, -1),  // Down
        // new Vec2(1, -1),  // Down-Right
        new Vec2(1, 0),   // Right
        // new Vec2(1, 1),   // Up-Right   
    ];
    for (let dir of directions) {
        let neighbor = grid.clone().add(dir);
        if (!checkOutOfBounds(neighbor, mapSize)) {
            neighbors.push(neighbor)

        } else {
        }
    }
    return neighbors;
}

export function checkOutOfBounds(grid: Vec2, mapSize: Vec2) {
    // console.log(grid, mapSize);
    
    if(grid.x < 0 || grid.y < 0) return true;
    if(grid.x >= mapSize.x || grid.y >= mapSize.y) return true;
    return false;
}


interface AStarNode {
    id: number;
    g: number;
    h: number;
    f: number;
    parent?: AStarNode;
    heapIndex?: number;
}

export interface AStarSearchState {
    open: BinaryHeap<AStarNode>;
    openMap: Map<number, AStarNode>;
    closed: Uint8Array;
    endId: number;
    done: boolean;
    path: Vec2[];
}

class BinaryHeap<T extends { f: number; heapIndex?: number }> {
    private items: T[] = [];

    get length() {
        return this.items.length;
    }

    push(item: T) {
        item.heapIndex = this.items.length;
        this.items.push(item);
        this.bubbleUp(this.items.length - 1);
    }

    pop(): T | undefined {
        if (this.items.length === 0) return undefined;

        const first = this.items[0];
        const last = this.items.pop()!;

        if (this.items.length > 0) {
            this.items[0] = last;
            last.heapIndex = 0;
            this.bubbleDown(0);
        }

        first.heapIndex = -1;
        return first;
    }

    update(item: T) {
        const index = item.heapIndex ?? -1;
        if (index < 0) return;
        this.bubbleUp(index);
        this.bubbleDown(index);
    }

    private bubbleUp(index: number) {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            if (this.items[parentIndex].f <= this.items[index].f) break;
            this.swap(parentIndex, index);
            index = parentIndex;
        }
    }

    private bubbleDown(index: number) {
        const length = this.items.length;

        while (true) {
            let smallest = index;
            const left = index * 2 + 1;
            const right = left + 1;

            if (left < length && this.items[left].f < this.items[smallest].f) {
                smallest = left;
            }

            if (right < length && this.items[right].f < this.items[smallest].f) {
                smallest = right;
            }

            if (smallest === index) break;

            this.swap(index, smallest);
            index = smallest;
        }
    }

    private swap(a: number, b: number) {
        const temp = this.items[a];
        this.items[a] = this.items[b];
        this.items[b] = temp;
        this.items[a].heapIndex = a;
        this.items[b].heapIndex = b;
    }
}

export class AStar {

    private grid: Uint8Array;

    private width = 0;
    private height = 0;

    private neighborCache = new Map<number, number[]>();

    private dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
    ];

    still: boolean = true;
    path: Vec2[] = [];

    constructor(private paths: Vec2[]) {


        // tìm kích thước map
        for (const p of paths) {
            this.width = Math.max(this.width, p.x);
            this.height = Math.max(this.height, p.y);
        }


        this.width++;
        this.height++;


        this.grid = new Uint8Array(
            this.width * this.height
        );


        // đánh dấu ô đi được
        for (const p of paths) {

            const id = this.toId(
                p.x,
                p.y
            );

            this.grid[id] = 1;
        }
        this.still = true;
    }
    

    findStep(start: Vec2, end: Vec2){
        // console.log("Start finding");        
        this.still = true;
        const startId = this.toId(start.x,start.y);
        const endId = this.toId(end.x,end.y);
        if(!this.grid[startId] ||!this.grid[endId]){
            this.still = false;
            // console.log("no path");
            this.path = [];
            return;
        }

        const open = new BinaryHeap<AStarNode>();
        const openMap = new Map<number,AStarNode>();
        const closed = new Uint8Array(this.grid.length);
        const h=this.heuristic(start.x,start.y,end.x,end.y);
        const first:AStarNode={id:startId,g:0,h,f:h};

        open.push(first);
        openMap.set(startId,first);

        let count = 0;
        let begin = performance.now();


        const check = () => {
            this.still = open.length > 0;
            // console.log(open.length);
            
            count ++;
            
            if(this.still) {
                const current = open.pop();
                openMap.delete(current.id);
                if(current.id===endId){
                    this.still = false;
                    this.path = this.buildPath(current);
                    let end = performance.now();
                    // console.log("Time",end-begin, count, this.path.length);
                    // console.log("Build",this.path.length);
                    return;
                }
                closed[current.id]=1;
                for(const nextId of this.getNeighbors(current.id)){
                    if(closed[nextId]) continue;
                    const g=current.g+1;
                    let node=openMap.get(nextId);
                    if(!node){
                        const pos=this.fromId(nextId);
                        node={id:nextId,g,h:this.heuristic(pos.x,pos.y,end.x,end.y),f:0,parent:current};
                        node.f=node.g+node.h;
                        open.push(node);
                        openMap.set(nextId,node);
                    }
                    else if(g < node.g){
                        node.g=g;
                        node.f=node.g+node.h;
                        node.parent=current;
                        open.update(node);
                    }
                }

                this.check = check;

            } else {
                this.still = false;
                // console.log("Not found",this.path);
                this.path = [];
                return;
            }
        }

        check();
    }

    find(start: Vec2, end: Vec2): Vec2[] {
        const startId = this.toId(
            start.x,
            start.y
        );

        const endId = this.toId(
            end.x,
            end.y
        );


        if(
            !this.grid[startId] ||
            !this.grid[endId]
        )
            return [];



        const open = new BinaryHeap<AStarNode>();

        const openMap = new Map<number,AStarNode>();

        const closed = new Uint8Array(
            this.grid.length
        );



        const h=this.heuristic(
            start.x,
            start.y,
            end.x,
            end.y
        );


        const first:AStarNode={
            id:startId,
            g:0,
            h,
            f:h
        };


        open.push(first);
        openMap.set(startId,first);

        while(open.length > 0){


            const current = open.pop();
            if (!current) break;

            openMap.delete(current.id);



            if(current.id===endId){

                return this.buildPath(
                    current
                );
            }



            closed[current.id]=1;



            for(const nextId of this.getNeighbors(current.id)){


                if(closed[nextId])
                    continue;



                const g=current.g+1;


                let node=openMap.get(nextId);



                if(!node){

                    const pos=this.fromId(nextId);


                    node={
                        id:nextId,
                        g,
                        h:this.heuristic(
                            pos.x,
                            pos.y,
                            end.x,
                            end.y
                        ),
                        f:0,
                        parent:current
                    };


                    node.f=node.g+node.h;


                    open.push(node);

                    openMap.set(
                        nextId,
                        node
                    );

                }
                else if(g < node.g){

                    node.g=g;
                    node.f=node.g+node.h;
                    node.parent=current;
                    open.update(node);
                }

            }
            

        }


        return [];
    }

    check: Function = null;

    update(deltaTime: number) {
        if(this.still) {
            this.check && this.check();
        }
    }

    
    private getNeighbors(id:number):number[]{


        const cache=this.neighborCache.get(id);

        if(cache)
            return cache;



        const x=id % this.width;

        const y=Math.floor(
            id / this.width
        );


        const result:number[]=[];



        for(const d of this.dirs){


            const nx=x+d[0];
            const ny=y+d[1];


            if(
                nx>=0 &&
                ny>=0 &&
                nx<this.width &&
                ny<this.height
            ){

                const nid=this.toId(
                    nx,
                    ny
                );


                if(this.grid[nid])
                    result.push(nid);
            }
        }


        this.neighborCache.set(
            id,
            result
        );


        return result;
    }
    private heuristic(
        x1:number,
        y1:number,
        x2:number,
        y2:number
    ){

        return Math.abs(x1-x2)
             + Math.abs(y1-y2);
    }
    private buildPath(node:AStarNode):Vec2[]{


        const result:Vec2[]=[];


        while(node){

            result.push(
                this.fromId(node.id)
            );

            node=node.parent!;
        }


        result.reverse();

        return result;
    }
    private toId(
        x:number,
        y:number
    ){

        return y*this.width+x;
    }
    private fromId(id:number){

        return new Vec2(
            id % this.width,
            Math.floor(id/this.width)
        );
    }
}

