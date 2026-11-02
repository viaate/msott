export default async function build(ctx){
const d=[];const P=(x,y,z,c,s)=>d.push([x,y,z,c,s||0.07]);
let r=ctx.seed||7;const rnd=()=>{r=(r*16807)%2147483647;return r/2147483647;};
const wood='#8a5a34',dark='#5e3b20',cream='#f3e6cc';
// easel legs
const leg=(x0,z0,x1,z1)=>{for(let t=0;t<=1;t+=0.02){P(x0+(x1-x0)*t,5.6*t,z0+(z1-z0)*t,wood,0.08);}};
leg(-1.3,0.5,-0.5,0.05);leg(1.3,0.5,0.5,0.05);leg(0,-1.2,0,-0.1);
// ledge
for(let x=-1.7;x<=1.7;x+=0.06)P(x,1.9,0.2,dark,0.08);
// canvas
for(let x=-1.6;x<=1.6;x+=0.09)for(let y=2.0;y<=4.9;y+=0.09)P(x,y,0.12,cream,0.06);
for(let x=-1.7;x<=1.7;x+=0.06){P(x,1.98,0.16,dark,0.07);P(x,4.98,0.16,dark,0.07);}
for(let y=1.98;y<=4.98;y+=0.06){P(-1.7,y,0.16,dark,0.07);P(1.7,y,0.16,dark,0.07);}
// background wash
for(let i=0;i<260;i++){const x=-1.5+rnd()*3,y=2.1+rnd()*2.7;P(x,y,0.18,y>3.6?'#a9c7e0':'#b9d39a',0.05);}
// dog portrait: tuxedo dog sitting
const Z=0.24,blk='#262626',wht='#f7f7f2';
const ell=(cx,cy,rx,ry,f,st)=>{for(let x=-rx;x<=rx;x+=st||0.07)for(let y=-ry;y<=ry;y+=st||0.07){if((x*x)/(rx*rx)+(y*y)/(ry*ry)<=1)P(cx+x,cy+y,Z,f(x,y),0.075);}};
ell(0,2.85,0.6,0.6,(x,y)=>(Math.abs(x)<0.22&&y>-0.2)?wht:blk);
ell(-0.25,2.3,0.13,0.25,()=>blk);ell(0.25,2.3,0.13,0.25,()=>blk);
ell(-0.25,2.12,0.14,0.07,()=>wht);ell(0.25,2.12,0.14,0.07,()=>wht);
ell(0.75,2.6,0.12,0.3,()=>blk);
ell(0,3.75,0.45,0.42,(x,y)=>(Math.abs(x)<0.12||(y<-0.1&&Math.abs(x)<0.25))?wht:blk);
ell(-0.5,3.75,0.12,0.3,()=>blk);ell(0.5,3.75,0.12,0.3,()=>blk);
P(-0.17,3.85,Z+0.04,'#111',0.11);P(0.17,3.85,Z+0.04,'#111',0.11);
P(0,3.55,Z+0.04,'#111',0.13);
for(let x=-0.18;x<=0.18;x+=0.06)P(x,3.42-Math.abs(x)*0.3,Z+0.03,'#c9506a',0.05);
// red collar
for(let x=-0.3;x<=0.3;x+=0.05)P(x,3.32,Z+0.03,'#c0392b',0.07);
P(0,3.24,Z+0.05,'#e8c34a',0.1);
// palette + paint pots on ground
const pots=['#c0392b','#e8c34a','#3a7bd5','#5aa864','#b0623a'];
pots.forEach((c,i)=>{const px=-2.6+i*0.5,pz=1.6;for(let a=0;a<6.28;a+=0.4)for(let h=0;h<0.35;h+=0.07)P(px+Math.cos(a)*0.15,h,pz+Math.sin(a)*0.15,'#cfcfcf',0.05);P(px,0.36,pz,c,0.14);});
for(let i=0;i<120;i++){const a=rnd()*6.28,rr=Math.sqrt(rnd())*0.7;P(2.3+Math.cos(a)*rr,0.03,1.5+Math.sin(a)*rr*0.7,'#d9b98a',0.06);}
pots.forEach((c,i)=>P(2.0+i*0.15,0.08,1.2+(i%2)*0.2,c,0.13));
// paw prints path from north edge (photobooth) to easel
for(let k=0;k<6;k++){const z=-5.5+k*0.8,x=(k%2?0.25:-0.25);P(x,0.03,z,'#b0623a',0.14);[-0.12,0,0.12].forEach(o=>P(x+o,0.03,z-0.17,'#b0623a',0.07));}
// a few dropped paint dabs sparkling around
for(let i=0;i<40;i++)P(-4+rnd()*8,0.03,-1+rnd()*5,pots[i%5],0.05);
return d;}