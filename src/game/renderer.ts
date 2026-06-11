import { GameState, GAME_WIDTH, GAME_HEIGHT, CAR_WIDTH, CAR_HEIGHT, RoadSegment } from './types';

interface Projection {
    px: number;
    py: number;
    scale: number;
    visible: boolean;
}

export function renderGame(ctx: CanvasRenderingContext2D, state: GameState) {
    const is3D = state.viewMode === '3D';
    
    // Projection helper
    const project = (x: number, y: number): Projection => {
        if (!is3D) return { px: x, py: y, scale: 1, visible: true };
        
        const cameraZ = state.player.y + 150; 
        const cameraHeight = 120;
        const horizonY = GAME_HEIGHT * 0.35;
        const focalLength = 300;

        const diffZ = cameraZ - y;
        if (diffZ < 1) return { px: x, py: GAME_HEIGHT*2, scale: 10, visible: false };

        const scale = focalLength / diffZ;
        const px = GAME_WIDTH / 2 + (x - state.player.x) * scale;
        const py = horizonY + cameraHeight * scale;
        
        return { px, py, scale, visible: true };
    };

    let skyTop = '#0f172a';
    let skyBottom = '#334155';
    let mtn1 = '#1e293b';
    let mtn2 = '#0f172a';
    let ground = '#111827';
    let roadFill = '#4b5563';
    let roadLine = '#fcd34d';

    if (state.level >= 5) {
        // Icy
        skyTop = '#0c4a6e';
        skyBottom = '#7dd3fc';
        mtn1 = '#bae6fd';
        mtn2 = '#e0f2fe';
        ground = '#f0f9ff';
        roadFill = '#94a3b8';
        roadLine = '#38bdf8';
    } else if (state.level >= 3) {
        // Desert
        skyTop = '#7c2d12';
        skyBottom = '#fcd34d';
        mtn1 = '#b45309';
        mtn2 = '#92400e';
        ground = '#d97706';
        roadFill = '#78350f';
        roadLine = '#fef3c7';
    }

    // Draw background
    if (is3D) {
        const horizonY = GAME_HEIGHT * 0.35;
        const grad = ctx.createLinearGradient(0, 0, 0, horizonY);
        grad.addColorStop(0, skyTop);
        grad.addColorStop(1, skyBottom);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, GAME_WIDTH, horizonY);

        // Distant Mountains (Layer 1)
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, horizonY);
        // Parallax offsets based on player's X and progress (distance)
        const pX = state.player.x * 0.05;
        const dist1 = state.distance * 0.2; 
        for (let x = 0; x <= GAME_WIDTH + 20; x += 10) {
            const wx = x + pX + dist1;
            let h = Math.sin(wx * 0.01) * 40;
            h += Math.sin(wx * 0.031) * 20;
            h += Math.sin(wx * 0.073) * 10;
            h = Math.max(0, h + 30);
            ctx.lineTo(x, horizonY - h);
        }
        ctx.lineTo(GAME_WIDTH, horizonY);
        ctx.fillStyle = mtn1; 
        ctx.fill();
        
        // Foothills / Trees (Layer 2) - Closer, moves faster
        ctx.beginPath();
        ctx.moveTo(0, horizonY);
        const pX2 = state.player.x * 0.15;
        const dist2 = state.distance * 0.6;
        for (let x = 0; x <= GAME_WIDTH + 20; x += 8) {
            const wx = x + pX2 + dist2;
            let h = Math.abs(Math.sin(wx * 0.02) * 25);
            h += Math.abs(Math.sin(wx * 0.053) * 15);
            ctx.lineTo(x, horizonY - h);
        }
        ctx.lineTo(GAME_WIDTH, horizonY);
        ctx.fillStyle = mtn2; 
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = ground;
        ctx.fillRect(0, horizonY, GAME_WIDTH, GAME_HEIGHT - horizonY);
    } else {
        ctx.fillStyle = ground;
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        
        // Subtle 2D parallax background
        ctx.save();
        ctx.fillStyle = mtn1;
        const scroll = (state.distance * 0.3) % 150;
        for (let y = -150; y < GAME_HEIGHT; y += 150) {
            for (let x = 0; x < GAME_WIDTH + 150; x += 150) {
                // Procedural size based on fixed grid
                const size = 10 + Math.abs(Math.sin(x * y) * 30);
                const xOff = Math.sin(y) * 40;
                ctx.beginPath();
                ctx.arc(x + xOff, y + scroll + 75, size, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }

    ctx.save();
    if (state.screenShake > 0) {
        const dx = (Math.random() - 0.5) * state.screenShake;
        const dy = (Math.random() - 0.5) * state.screenShake;
        ctx.translate(dx, dy);
    }

    // Draw Road Polygon
    if (state.road.length > 0) {
        ctx.fillStyle = roadFill; 
        ctx.beginPath();
        let firstRendered = false;
        
        // Left edge
        for (let i = 0; i < state.road.length; i++) {
            const seg = state.road[i];
            const p = project(seg.centerX - seg.width / 2, seg.y);
            if (is3D && !p.visible) continue;
            if (!firstRendered) {
                ctx.moveTo(p.px, p.py);
                firstRendered = true;
            } else {
                ctx.lineTo(p.px, p.py);
            }
        }
        
        // Right edge (bottom up)
        for (let i = state.road.length - 1; i >= 0; i--) {
            const seg = state.road[i];
            const p = project(seg.centerX + seg.width / 2, seg.y);
            if (is3D && !p.visible) continue;
            ctx.lineTo(p.px, p.py);
        }
        
        ctx.closePath();
        ctx.fill();

        // Road markings
        if (is3D) {
            for (let i = state.road.length - 2; i >= 0; i--) {
                const seg1 = state.road[i+1];
                const seg2 = state.road[i];
                const absDist = state.distance + seg1.y; 
                if (Math.floor(absDist / 80) % 2 === 0) {
                    const p1 = project(seg1.centerX, seg1.y);
                    const p2 = project(seg2.centerX, seg2.y);
                    if (p1.visible && p2.visible) {
                        ctx.beginPath();
                        ctx.moveTo(p1.px, p1.py);
                        ctx.lineTo(p2.px, p2.py);
                        ctx.lineWidth = 4 * p1.scale;
                        ctx.strokeStyle = roadLine;
                        ctx.stroke();
                    }
                }
            }
        } else {
            ctx.beginPath();
            ctx.strokeStyle = roadLine; 
            ctx.lineWidth = 4;
            ctx.setLineDash([20, 20]);
            ctx.lineDashOffset = -state.distance % 40; 
            ctx.moveTo(state.road[0].centerX, state.road[0].y);
            for (let i = 1; i < state.road.length; i++) {
                ctx.lineTo(state.road[i].centerX, state.road[i].y);
            }
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    // Entity rendering
    type GameEntity = { type: string, y: number, ref: any };
    const entities: GameEntity[] = [];
    state.obstacles.forEach(o => entities.push({ type: 'obstacle', y: o.y, ref: o }));
    state.pickups.forEach(p => entities.push({ type: 'pickup', y: p.y, ref: p }));
    state.enemies.forEach(e => entities.push({ type: 'enemy', y: e.y, ref: e }));
    entities.push({ type: 'player', y: state.player.y, ref: state.player });
    state.particles.forEach(p => entities.push({ type: 'particle', y: p.y, ref: p }));

    // Ascending Y: smaller Y first (furthest away in 3D, bottom-most relative in 2D draw-order logic)
    // Wait, in 2D, smaller Y is top of screen, should be drawn First to be behind lower things, YES!
    entities.sort((a, b) => a.y - b.y);

    for (const ent of entities) {
        const p = project(ent.ref.x, ent.ref.y);
        if (is3D && !p.visible) continue;

        if (ent.type === 'particle') drawParticle(ctx, ent.ref, p, is3D);
        else if (ent.type === 'obstacle') drawObstacle(ctx, ent.ref, p, is3D);
        else if (ent.type === 'pickup') drawPickup(ctx, ent.ref, p, is3D);
        else if (ent.type === 'player' || ent.type === 'enemy') {
            if (ent.ref.isDead) drawFallingCar(ctx, ent.ref, p, is3D);
            else drawCar(ctx, ent.ref, p, is3D);
        }
    }

    // Weather Effects Overlays
    if (state.weather === 'RAIN') {
        ctx.save();
        ctx.fillStyle = 'rgba(71, 85, 105, 0.4)'; // Darken
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        const dropCount = Math.min(500, 100 + state.level * 50);
        for (let i = 0; i < dropCount; i++) {
            const rx = (Math.random() * GAME_WIDTH + Date.now() * 0.1) % GAME_WIDTH;
            const ry = (Math.random() * GAME_HEIGHT + (Date.now() * 1.5 + i * 20)) % GAME_HEIGHT;
            ctx.fillRect(rx, ry, 1, 15);
        }
        ctx.restore();
    } else if (state.weather === 'FOG') {
        ctx.save();
        const baseFog = Math.min(0.95, 0.5 + state.level * 0.05);
        const fogAlpha = baseFog + Math.sin(Date.now() * 0.001) * 0.1;
        const grad = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
        grad.addColorStop(0, `rgba(203, 213, 225, ${fogAlpha})`);
        grad.addColorStop(0.5, `rgba(203, 213, 225, ${fogAlpha * 0.8})`);
        grad.addColorStop(1, `rgba(203, 213, 225, 0.1)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        ctx.restore();
    }

    ctx.restore();
}

function getWeaponColor(type: string) {
    if (type === 'BUMP') return '#eab308';
    if (type === 'SHIELD') return '#3b82f6';
    if (type === 'SAW') return '#ef4444';
    return '#fff';
}

function drawParticle(ctx: CanvasRenderingContext2D, p: any, proj: Projection, is3D: boolean) {
    ctx.save();
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    // Use scale for size
    const size = p.size * (p.life / p.maxLife) * (is3D ? proj.scale * 0.8 : 1);
    ctx.arc(proj.px, proj.py, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawObstacle(ctx: CanvasRenderingContext2D, o: any, proj: Projection, is3D: boolean) {
    ctx.save();
    ctx.translate(proj.px, proj.py);
    if (is3D) {
       ctx.scale(proj.scale, proj.scale);
       ctx.translate(0, -o.radius); // ground offset
    }

    if (o.type === 'OIL' || o.type === 'PUDDLE') {
        ctx.beginPath();
        if (is3D) ctx.scale(1, 0.4);
        ctx.arc(0, 0, o.radius, 0, Math.PI * 2);
        ctx.fillStyle = o.type === 'PUDDLE' ? 'rgba(56, 189, 248, 0.6)' : '#1f2937';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(-5, -5, o.radius * 0.4, o.radius * 0.2, Math.PI/4, 0, Math.PI * 2);
        ctx.fillStyle = o.type === 'PUDDLE' ? 'rgba(125, 211, 252, 0.4)' : '#374151';
        ctx.fill();
    } else if (o.type === 'ROCK') {
        ctx.beginPath();
        ctx.moveTo(-o.radius, o.radius);
        ctx.lineTo(-o.radius*0.5, -o.radius*0.8);
        ctx.lineTo(o.radius*0.8, -o.radius*0.6);
        ctx.lineTo(o.radius, o.radius*0.8);
        ctx.closePath();
        ctx.fillStyle = '#6b7280';
        ctx.fill();
        ctx.strokeStyle = '#4b5563';
        ctx.lineWidth = 2;
        ctx.stroke();
    } else if (o.type === 'BARREL') {
        ctx.fillStyle = '#ea580c';
        ctx.fillRect(-o.radius*0.8, -o.radius, o.radius*1.6, o.radius*2);
        ctx.fillStyle = '#fff';
        ctx.fillRect(-o.radius*0.8, -o.radius*0.5, o.radius*1.6, 5);
        ctx.fillRect(-o.radius*0.8, o.radius*0.2, o.radius*1.6, 5);
    }
    
    ctx.restore();
}

function drawPickup(ctx: CanvasRenderingContext2D, p: any, proj: Projection, is3D: boolean) {
    ctx.save();
    ctx.translate(proj.px, proj.py);
    if (is3D) {
       ctx.scale(proj.scale, proj.scale);
       ctx.translate(0, -p.radius); 
    }
    
    ctx.beginPath();
    ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = getWeaponColor(p.type);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Inter';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.type.charAt(0), 0, 0);

    ctx.restore();
}

function drawCar(ctx: CanvasRenderingContext2D, car: any, proj: Projection, is3D: boolean) {
    ctx.save();
    ctx.translate(proj.px, proj.py);
    
    const rotation = (car.vx / 400) * 0.2; 
    
    if (is3D) {
        ctx.scale(proj.scale, proj.scale);
        // Shadow base
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.ellipse(0, 0, car.width/1.8, car.height/4, 0, 0, Math.PI*2);
        ctx.fill();

        ctx.rotate(rotation); // lean into turns
        
        // 3D pseudo shape (back face)
        const h = 40;
        
        // Body back
        ctx.fillStyle = car.color;
        ctx.fillRect(-car.width/2, -h, car.width, h);

        // Tires
        ctx.fillStyle = '#000';
        ctx.fillRect(-car.width/2 - 2, -10, 8, 10);
        ctx.fillRect(car.width/2 - 6, -10, 8, 10);

        // Window rear
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(-car.width/2+4, -h+4, car.width-8, 10);

        // Tail lights
        ctx.fillStyle = car.isPlayer ? '#ef4444' : '#fff';
        ctx.fillRect(-car.width/2+2, -h+18, 10, 4);
        ctx.fillRect(car.width/2-12, -h+18, 10, 4);

        if (car.weaponTimer > 0) {
            if (car.activeWeapon === 'SHIELD') {
                ctx.beginPath();
                ctx.arc(0, -h/2, car.width, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(59, 130, 246, ${Math.random() * 0.5 + 0.5})`;
                ctx.lineWidth = 4;
                ctx.stroke();
            } else if (car.activeWeapon === 'SAW') {
                const time = Date.now() * 0.01;
                for (const side of [-1, 1]) {
                   ctx.save();
                   ctx.translate(side * (car.width/2 + 10), -h/2);
                   ctx.rotate(time);
                   ctx.beginPath();
                   ctx.arc(0, 0, 15, 0, Math.PI * 2);
                   ctx.fillStyle = '#9ca3af';
                   ctx.fill();
                   ctx.beginPath();
                   ctx.setLineDash([5, 5]);
                   ctx.arc(0, 0, 18, 0, Math.PI * 2);
                   ctx.strokeStyle = '#ef4444';
                   ctx.lineWidth = 4;
                   ctx.stroke();
                   ctx.restore();
                }
            } else if (car.activeWeapon === 'BUMP') {
                ctx.fillStyle = '#eab308';
                ctx.fillRect(-car.width / 2 - 8, -h/2, 8, 20);
                ctx.fillRect(car.width / 2, -h/2, 8, 20);
            }
        }
    } else {
        ctx.rotate(rotation);
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(-car.width/2+4, -car.height/2+4, car.width, car.height);
        
        ctx.fillStyle = car.color;
        ctx.fillRect(-car.width / 2, -car.height / 2, car.width, car.height);
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(-car.width / 2 + 5, -car.height / 2 + 15, car.width - 10, 15);
        ctx.fillRect(-car.width / 2 + 5, car.height / 2 - 20, car.width - 10, 10);
        if (car.isPlayer) {
            ctx.fillStyle = '#fef08a';
            ctx.fillRect(-car.width / 2 + 2, -car.height / 2 - 5, 8, 5);
            ctx.fillRect(car.width / 2 - 10, -car.height / 2 - 5, 8, 5);
            ctx.beginPath();
            ctx.moveTo(-car.width / 2 + 6, -car.height / 2 - 5);
            ctx.lineTo(-car.width * 1.5, -car.height / 2 - 100);
            ctx.lineTo(-car.width * 0.5, -car.height / 2 - 100);
            ctx.fillStyle = 'rgba(254, 240, 138, 0.1)';
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(car.width / 2 - 6, -car.height / 2 - 5);
            ctx.lineTo(car.width * 0.5, -car.height / 2 - 100);
            ctx.lineTo(car.width * 1.5, -car.height / 2 - 100);
            ctx.fillStyle = 'rgba(254, 240, 138, 0.1)';
            ctx.fill();
        }

        if (car.weaponTimer > 0) {
            if (car.activeWeapon === 'SHIELD') {
                ctx.beginPath();
                ctx.arc(0, 0, Math.max(CAR_WIDTH, CAR_HEIGHT) * 0.8, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(59, 130, 246, ${Math.random() * 0.5 + 0.5})`;
                ctx.lineWidth = 4;
                ctx.stroke();
            } else if (car.activeWeapon === 'SAW') {
                const time = Date.now() * 0.01;
                for (const side of [-1, 1]) {
                   ctx.save();
                   ctx.translate(side * (CAR_WIDTH/2 + 10), 0);
                   ctx.rotate(time);
                   //...
                   ctx.beginPath();
                   ctx.arc(0, 0, 15, 0, Math.PI * 2);
                   ctx.fillStyle = '#9ca3af';
                   ctx.fill();
                   ctx.beginPath();
                   ctx.setLineDash([5, 5]);
                   ctx.arc(0, 0, 18, 0, Math.PI * 2);
                   ctx.strokeStyle = '#ef4444';
                   ctx.lineWidth = 4;
                   ctx.stroke();
                   ctx.restore();
                }
            } else if (car.activeWeapon === 'BUMP') {
                ctx.fillStyle = '#eab308';
                ctx.fillRect(-car.width / 2 - 5, -10, 5, 20);
                ctx.fillRect(car.width / 2, -10, 5, 20);
            }
        }
    }
    
    ctx.restore();
}

function drawFallingCar(ctx: CanvasRenderingContext2D, car: any, proj: Projection, is3D: boolean) {
    if (!car.fallScale) car.fallScale = 1;
    car.fallScale -= 0.05;
    if (car.fallScale <= 0) return;

    ctx.save();
    ctx.translate(proj.px, proj.py);
    
    if (is3D) {
       ctx.scale(proj.scale * car.fallScale, proj.scale * car.fallScale);
       ctx.globalAlpha = car.fallScale;
       ctx.rotate((1 - car.fallScale) * 10);
       const h = 40;
       ctx.fillStyle = car.color;
       ctx.fillRect(-car.width/2, -h, car.width, h);
    } else {
       ctx.scale(car.fallScale, car.fallScale);
       ctx.globalAlpha = car.fallScale;
       ctx.rotate((1 - car.fallScale) * 10);
       ctx.fillStyle = car.color;
       ctx.fillRect(-car.width / 2, -car.height / 2, car.width, car.height);
    }
    
    ctx.restore();
}
