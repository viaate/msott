export default async function build(ctx){
const d=[];const P=(x,y,z,c,s=0.07)=>d.push([x,y,z,c,s]);
let seed=7;const r=()=>{seed=(seed*16807)%2147483647;return seed/2147483647};
const wood='#8a5a36',cream='#f3e6cf',red='#b33a2e',dred='#7e2620';
// booth box: x -2.5..0.5, z -1.5..1.5, y 0..7 ; open face at +x (toward the house door)
const X0=-2.5,X1=0.5,Z0=-1.5,Z1=1.5,H=7;
// frame edges
const edge=(a,b,n)=>{for(let i=0;i<=n;i++){const t=i/n;P(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t,cream,0.09)}};
const cs=[[X0,Z0],[X0,Z1],[X1,Z0],[X1,Z1]];
for(const [x,z] of cs)edge([x,0,z],[x,H,z],70);
edge([X0,H,Z0],[X1,H,Z0],30);edge([X0,H,Z1],[X1,H,Z1],30);edge([X0,H,Z0],[X0,H,Z1],30);edge([X1,H,Z0],[X1,H,Z1],30);
// wooden side & back walls
for(let i=0;i<2600;i++){const y=r()*H;const side=r();
 if(side<0.33)P(X0,y,Z0+r()*(Z1-Z0),wood,0.06);
 else if(side<0.66)P(X0+r()*(X1-X0),y,Z0,wood,0.06);
 else P(X0+r()*(X1-X0),y,Z1,wood,0.06);}
// curtain on open face, drawn mostly closed with wavy folds, gap at the right
for(let i=0;i<3200;i++){const z=Z0+0.05+r()*2.1;const y=0.3+r()*(H-0.7);const fold=Math.sin(z*9)*0.12;
 P(X1+0.05+fold,y,z,(Math.sin(z*9)>0.3)?dred:red,0.06);}
// curtain rod
edge([X1+0.15,H-0.3,Z0],[X1+0.15,H-0.3,Z1],30);
// sign above: a dot camera with glowing flash
const sx=X1+0.2,sy=H+1.2;
for(let i=0;i<900;i++){const z=-1+r()*2,y=sy-0.6+r()*1.2;P(sx,y,z,'#2a2522',0.06)}
for(let i=0;i<220;i++){const a=r()*6.283,rr=Math.sqrt(r())*0.45;P(sx+0.05,sy+Math.sin(a)*rr,Math.cos(a)*rr,rr<0.2?'#6fa8dc':'#d8d0c0',0.06)}
for(let i=0;i<60;i++){const a=r()*6.283,rr=Math.sqrt(r())*0.14;P(sx+0.05,sy+0.45+Math.sin(a)*rr,-0.7+Math.cos(a)*rr,'#fff4b0',0.08)}
// stool inside + little photo strip hanging out of a slot on the side
for(let i=0;i<300;i++){const a=r()*6.283,rr=Math.sqrt(r())*0.5;P(-1+Math.cos(a)*rr,1.6,Math.sin(a)*rr,'#c98a4a',0.06)}
for(let k=0;k<3;k++)edge([-1+0.3*Math.cos(k*2.1),0,0.3*Math.sin(k*2.1)],[-1+0.3*Math.cos(k*2.1),1.6,0.3*Math.sin(k*2.1)],14);
for(let i=0;i<4;i++)for(let j=0;j<60;j++)P(X1+0.08,2.4+i*0.5+r()*0.4,Z1+0.15+r()*0.4,j%5?cream:'#c86a3c',0.05);
// path of warm dots from the house door (east edge) to the booth
for(let i=0;i<500;i++){const x=X1+0.8+r()*(5.75-X1-0.8),z=-0.9+r()*1.8;P(x,0.02,z,r()<0.5?'#6b4a33':'#5a3d28',0.07)}
return d;}