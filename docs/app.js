import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
const lessons=[
 {id:'side',n:'01',name:'Boční seřízení',axis:'↔',title:'Srovnejte spáru mezi dvířky.',desc:'Přední seřizovací šroub na ramínku mění naložení dvířek — jejich polohu doleva a doprava vůči korpusu.',steps:['Otáčejte předním šroubem po malých krocích.','Sledujte spáru. Pro rovnoměrný posun seřiďte všechny závěsy.'],note:'Rozsah D ±3 mm podle montážního výkresu. Otáčení v animaci není kalibrované na počet otáček skutečného šroubu.',pos:[.005,0,.042],mesh:'side_screw',min:-3,max:3},
 {id:'depth',n:'02',name:'Hloubka dvířek',axis:'↗',title:'Nastavte odstup od korpusu.',desc:'Zadní seřizovací prvek na ramínku slouží k posunu závěsu ve směru hloubky. Tím se mění mezera mezi dvířky a čelní hranou korpusu.',steps:['Najděte zadní šroub blíž k podložce.','Seřizujte po malých krocích a kontrolujte dosednutí dvířek.'],note:'Funkce přiřazena podle konstrukce modelu. Rozsah ani směr otáčení nejsou v dostupném podkladu uvedeny; posuvník ukazuje pouze princip.',pos:[.005,0,.015],mesh:'depth_screw',min:-100,max:100},
 {id:'height',n:'03',name:'Výška na podložce',axis:'↕',title:'Zarovnejte horní hrany.',desc:'Excentr na modelované podložce posouvá její pohyblivou část nahoru a dolů. Dvířka se tak výškově srovnají se sousedním čelem.',steps:['Při seřizování přidržujte dvířka.','U podložky s excentrem otáčejte excentrem; u běžné podložky se výška upravuje v montážních drážkách.'],note:'Váš model obsahuje podložku 315856 řady S3. Kompatibilita se S5 není ověřena. Pro S5 je v katalogu uvedena excentrická podložka 92594T.',pos:[-.013,-.0154,.0306],mesh:'mount002',min:-100,max:100},
];const $ = id => document.getElementById(id);
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const parts={},bases={},pins=[];
let current=lessons[0],amount=0,playing=false,progress=0,startedAt=0,mode='detail',model=null;
let scene,camera,renderer,controls,zoomScene,zoomCamera,zoomRenderer,door,ghost,zoomArrow;
let modelBox,cameraTransition=null,sceneVisible=true;
const viewport=$('viewport'),zoomViewport=$('cabinetViewport');
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
const modelCenter=new THREE.Vector3(-.014,0,.035);
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const assembly=['arm','cup','link','side_screw','depth_screw','clip'];
const svgNS='http://www.w3.org/2000/svg';

for(const l of lessons){
 const b=document.createElement('button');b.className='part';b.dataset.id=l.id;b.innerHTML=`<span class="part-number">${l.n}</span><span class="part-name">${l.name}</span><span class="part-axis">${l.axis}</span>`;b.onclick=()=>select(l.id,true);$('parts').append(b);
 const el=document.createElement('button');el.className='pin';el.textContent=l.n;el.title=l.name;el.setAttribute('aria-label',l.name);el.onclick=()=>select(l.id,true);$('labels').append(el);
 const group=document.createElementNS(svgNS,'g'),line=document.createElementNS(svgNS,'line'),dot=document.createElementNS(svgNS,'circle');dot.setAttribute('r','2.5');group.append(line,dot);$('leaders').append(group);pins.push({lesson:l,el,group,line,dot});
}
function syncUI(){
 const value=current.id==='side'?`${amount.toFixed(1).replace('.',',')} mm`:`${Math.round(amount)} %`;
 $('value').textContent=value;$('insetValue').textContent=value;$('adjustment').value=String(amount);
 $('playText').textContent=playing?'Pozastavit':'Přehrát pohyb';$('playIcon').textContent=playing?'Ⅱ':'▶';$('play').setAttribute('aria-pressed',String(playing));
}
function select(id,animate=false){
 const selected=lessons.find(l=>l.id===id);if(!selected)throw Error('Unknown control');current=selected;playing=false;progress=0;amount=0;
 $('lessonTag').textContent=`SEŘÍZENÍ / ${current.n}`;$('axisBadge').textContent=current.axis;$('viewCaption').textContent=`${current.n} / ${current.name.toLocaleUpperCase('cs')}`;
 $('lessonTitle').textContent=current.title;$('lessonDescription').textContent=current.desc;$('lessonNote').textContent=current.note;
 $('steps').replaceChildren(...current.steps.map(t=>{const li=document.createElement('li');li.textContent=t;return li;}));
 $('adjustment').min=current.min;$('adjustment').max=current.max;$('adjustment').step=current.id==='side'?'.1':'1';
 $('rangeLabel').textContent=current.id==='side'?'Boční posun':'Názorný posun';
 $('rangeMin').textContent=current.id==='side'?'−3 mm':current.id==='depth'?'Blíž ke korpusu':'Dolů';
 $('rangeMax').textContent=current.id==='side'?'+3 mm':current.id==='depth'?'Dál od korpusu':'Nahoru';
 $('insetTitle').textContent={side:'Spára mezi dvířky',depth:'Odstup od korpusu',height:'Zarovnání horních hran'}[current.id];
 $('insetNote').textContent='Pohyb je pro názornost zvýrazněný 4×.';
 document.querySelectorAll('.part').forEach(b=>{const active=b.dataset.id===id;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
 pins.forEach(p=>{const active=p.lesson.id===id;p.el.classList.toggle('active',active);p.group.classList.toggle('active',active);p.el.setAttribute('aria-pressed',String(active));});
 syncUI();if(model){applyMotion();focusCamera(!reducedMotion);fitInset();if(animate&&!reducedMotion)togglePlay();}
}
function togglePlay(){if(!model)return;if(playing){progress=Math.min((performance.now()-startedAt)/4000,1);playing=false;}else{if(progress>=1)progress=0;startedAt=performance.now()-progress*4000;playing=true;}syncUI();}
function reset(){playing=false;progress=0;amount=0;syncUI();}
$('play').onclick=togglePlay;$('reset').onclick=reset;
$('adjustment').oninput=e=>{playing=false;progress=0;amount=Number(e.target.value);syncUI();};
$('sourcesOpen').onclick=()=>$('sources').showModal();$('sourcesClose').onclick=()=>$('sources').close();
$('sources').onclick=e=>{if(e.target===$('sources')){const r=$('sources').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('sources').close();}};
function setMode(next){if(!['detail','cabinet'].includes(next))throw Error('Unknown view');mode=next;document.body.dataset.view=next;$('cabinetInset').hidden=next!=='cabinet';$('detailView').setAttribute('aria-pressed',String(next==='detail'));$('cabinetView').setAttribute('aria-pressed',String(next==='cabinet'));requestAnimationFrame(()=>{resize();fitInset();});}
$('detailView').onclick=()=>setMode('detail');$('cabinetView').onclick=()=>setMode('cabinet');$('resetCamera').onclick=()=>focusCamera(!reducedMotion);

function addLights(target){target.add(new THREE.HemisphereLight(0xffffff,0x434951,.85));for(const [p,power]of [[[.2,.15,.1],2],[[-.1,.04,-.1],1.2],[[.05,-.1,.15],.6]]){const light=new THREE.DirectionalLight(0xffffff,power);light.position.set(...p);target.add(light);}}
function studioEnvironment(){const environment=new THREE.Scene();environment.background=new THREE.Color('#717780');const white=new THREE.MeshBasicMaterial({color:'#ffffff'});for(const [x,y,z,w,h,d]of [[3,2,0,.1,4,2],[-3,1,-1,.1,3,3],[0,4,0,5,.1,4],[0,-3,2,3,.1,1]]){const light=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),white);light.position.set(x,y,z);environment.add(light);}const generator=new THREE.PMREMGenerator(renderer);const texture=generator.fromScene(environment,.02).texture;generator.dispose();return texture;}
function makeCabinet(){
 zoomScene=new THREE.Scene();zoomScene.background=new THREE.Color('#f4f6f9');addLights(zoomScene);zoomScene.environment=scene.environment;zoomScene.environmentIntensity=.65;
 zoomCamera=new THREE.OrthographicCamera(-.1,.1,.05,-.05,.001,5);
 const wood=new THREE.MeshStandardMaterial({color:'#c5b69d',roughness:.87}),frame=new THREE.MeshStandardMaterial({color:'#989da4',metalness:.86,roughness:.26}),glass=new THREE.MeshPhysicalMaterial({color:'#d8e0e8',transparent:true,opacity:.33,roughness:.2,side:THREE.DoubleSide,depthWrite:false});
 const box=(w,h,d,x,y,z,mat,parent=zoomScene)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);parent.add(mesh);return mesh;};
 box(.018,.23,.15,-.0303,0,-.006,wood);box(.36,.018,.15,.14,.119,-.006,wood);
 function makeDoor(x){const group=new THREE.Group();zoomScene.add(group);for(const y of [-.097,.097])box(.177,.012,.016,.05+x,y,.076,frame,group);for(const side of [-.032,.132])box(.013,.182,.016,side+x,0,.076,frame,group);box(.151,.181,.005,.05+x,0,.077,glass,group);return group;}
 door=makeDoor(0);makeDoor(.183);
 const outline=new THREE.BufferGeometry().setFromPoints([V(-.0385,-.103,.087),V(.1385,-.103,.087),V(.1385,.103,.087),V(-.0385,.103,.087),V(-.0385,-.103,.087)]);
 ghost=new THREE.Line(outline,new THREE.LineDashedMaterial({color:'#5277a4',dashSize:.002,gapSize:.0015,transparent:true,opacity:.8,depthTest:false}));ghost.computeLineDistances();ghost.renderOrder=5;zoomScene.add(ghost);
 zoomArrow=new THREE.ArrowHelper(V(1,0,0),V(.15,.085,.103),.025,0x39699e,.006,.004);zoomScene.add(zoomArrow);fitInset();
}
function fitInset(){if(!zoomCamera)return;const w=zoomViewport.clientWidth,h=zoomViewport.clientHeight;if(!w||!h)return;zoomRenderer.setSize(w,h,false);const aspect=w/h;
 const target=current.id==='depth'?V(.13,.085,.05):V(.14,.084,.078);
 zoomCamera.position.copy(target).add(current.id==='depth'?V(.2,.09,.15):V(.035,.012,.3));zoomCamera.lookAt(target);
 const height=Math.max(.07,.12/aspect);zoomCamera.left=-height*aspect/2;zoomCamera.right=height*aspect/2;zoomCamera.top=height/2;zoomCamera.bottom=-height/2;zoomCamera.updateProjectionMatrix();
}
function configureFrustum(){if(!camera||!modelBox)return;const aspect=viewport.clientWidth/Math.max(1,viewport.clientHeight);camera.updateMatrixWorld(true);const projected=[];for(const x of [modelBox.min.x,modelBox.max.x])for(const y of [modelBox.min.y,modelBox.max.y])for(const z of [modelBox.min.z,modelBox.max.z])projected.push(V(x,y,z).applyMatrix4(camera.matrixWorldInverse));
 const width=Math.max(...projected.map(p=>p.x))-Math.min(...projected.map(p=>p.x));const height=Math.max(...projected.map(p=>p.y))-Math.min(...projected.map(p=>p.y));
 const frameHeight=Math.max(height/.78,width/(aspect*.68));camera.left=-frameHeight*aspect/2;camera.right=frameHeight*aspect/2;camera.top=frameHeight/2;camera.bottom=-frameHeight/2;camera.updateProjectionMatrix();
}
function focusCamera(smooth=true){if(!model)return;const direction={side:V(1,.36,.65),depth:V(1,.32,.38),height:V(1,-.38,.48)}[current.id].normalize();const target=modelCenter.clone();const position=target.clone().addScaledVector(direction,.18);
 if(!smooth){controls.target.copy(target);camera.position.copy(position);camera.zoom=1;camera.lookAt(target);configureFrustum();controls.update();return;}
 cameraTransition={start:performance.now(),from:camera.position.clone(),target:controls.target.clone(),zoom:camera.zoom,position,to:target};
}
function resize(){if(!renderer)return;const w=viewport.clientWidth,h=viewport.clientHeight;if(w&&h){renderer.setSize(w,h,false);configureFrustum();}fitInset();}
function applyMotion(){
 if(!model)return;for(const [name,o]of Object.entries(parts)){o.position.copy(bases[name].position);o.quaternion.copy(bases[name].quaternion);}
 const axis=current.id==='side'?'x':current.id==='depth'?'z':'y';const offset=current.id==='side'?amount*.001:amount/100*.004;
 const moving=current.id==='height'?[...assembly,'mount']:assembly;for(const name of moving)if(parts[name])parts[name].position[axis]+=offset;
 const screw=parts[current.mesh]||parts['mount.002'];if(screw){const angle=current.id==='side'?amount*Math.PI/3:amount/100*Math.PI;screw.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(V(1,0,0),angle));}
 if(door){door.position.set(0,0,0);door.position[axis]=offset*4;const dir=V(0,0,0);dir[axis]=Math.sign(offset)||1;zoomArrow.setDirection(dir);zoomArrow.position.set(.15,.073,.112);zoomArrow.visible=Math.abs(offset)>.00005;zoomArrow.setLength(Math.max(.012,Math.abs(offset)*4),.004,.0025);}
}
function pointFor(l){const p=V(...l.pos);if(current.id==='side'&&l.id!=='height')p.x+=amount*.001;if(current.id==='depth'&&l.id!=='height')p.z+=amount/100*.004;if(current.id==='height'&&l.id!=='height')p.y+=amount/100*.004;return p;}
function drawLabels(){
 const w=viewport.clientWidth,h=viewport.clientHeight;if(!w||!h)return;
 const anchors=pins.map(p=>pointFor(p.lesson).project(camera));
 const screenBounds=[];for(const x of [modelBox.min.x,modelBox.max.x])for(const y of [modelBox.min.y,modelBox.max.y])for(const z of [modelBox.min.z,modelBox.max.z]){const p=V(x,y,z).project(camera);screenBounds.push({x:(p.x*.5+.5)*w,y:(-.5*p.y+.5)*h});}
 const left=Math.min(...screenBounds.map(p=>p.x)),right=Math.max(...screenBounds.map(p=>p.x)),top=Math.min(...screenBounds.map(p=>p.y)),bottom=Math.max(...screenBounds.map(p=>p.y));
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const layouts=[[clamp(left-26,26,w-26),clamp(top+20,27,h-27)],[clamp(right+26,26,w-26),clamp(top+35,27,h-82)],[clamp(right+26,26,w-26),clamp(Math.max(bottom-5,top+95),82,h-27)]];
 pins.forEach((p,i)=>{const a=anchors[i],x=(a.x*.5+.5)*w,y=(-a.y*.5+.5)*h,[lx,ly]=layouts[i];const hidden=a.z>1||a.z< -1||x<0||x>w||y<0||y>h;p.el.hidden=hidden;p.group.style.display=hidden?'none':'';p.el.style.left=`${lx}px`;p.el.style.top=`${ly}px`;p.line.setAttribute('x1',lx);p.line.setAttribute('y1',ly);p.line.setAttribute('x2',x);p.line.setAttribute('y2',y);p.dot.setAttribute('cx',x);p.dot.setAttribute('cy',y);});
}
function hit(e){const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);return raycaster.intersectObjects(Object.values(parts),false)[0];}
function lessonFor(name){return lessons.find(l=>l.mesh===name||l.id==='height'&&name==='mount.002');}
function init(){
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;viewport.prepend(renderer.domElement);
 scene=new THREE.Scene();addLights(scene);scene.environment=studioEnvironment();scene.environmentIntensity=1;
 camera=new THREE.OrthographicCamera(-.07,.07,.05,-.05,.001,5);camera.position.set(.16,.06,.11);camera.lookAt(modelCenter);
 controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.1;controls.enablePan=false;controls.minZoom=.7;controls.maxZoom=4;controls.target.copy(modelCenter);controls.update();
 // One finger scrolls the page on phones; horizontal drags rotate without blocking vertical navigation.
 if(matchMedia('(pointer:coarse)').matches){controls.touches.ONE=THREE.TOUCH.ROTATE;controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;renderer.domElement.style.touchAction='pan-y';}
 zoomRenderer=new THREE.WebGLRenderer({antialias:true});zoomRenderer.setPixelRatio(Math.min(devicePixelRatio,1.5));zoomRenderer.outputColorSpace=THREE.SRGBColorSpace;zoomRenderer.toneMapping=THREE.ACESFilmicToneMapping;zoomRenderer.toneMappingExposure=.95;zoomViewport.append(zoomRenderer.domElement);makeCabinet();
 new ResizeObserver(resize).observe(viewport);new ResizeObserver(fitInset).observe(zoomViewport);resize();
 new IntersectionObserver(entries=>{sceneVisible=entries[0].isIntersecting;},{rootMargin:'120px'}).observe(viewport);
 let down=null;renderer.domElement.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];cameraTransition=null;});renderer.domElement.addEventListener('pointerup',e=>{if(!model||!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>7)return;const h=hit(e),l=h&&lessonFor(h.object.name);if(l)select(l.id,true);});renderer.domElement.addEventListener('pointermove',e=>{if(e.pointerType!=='mouse'||!model)return;const h=hit(e);renderer.domElement.style.cursor=h&&lessonFor(h.object.name)?'pointer':'grab';});
 new GLTFLoader().load('./hinge.glb',g=>{model=g.scene;scene.add(model);model.traverse(o=>{if(o.isMesh){parts[o.name]=o;bases[o.name]={position:o.position.clone(),quaternion:o.quaternion.clone()};o.material=new THREE.MeshStandardMaterial({color:'#c4c7cc',metalness:.94,roughness:.28,envMapIntensity:1});}});modelBox=new THREE.Box3().setFromObject(model);modelBox.getCenter(modelCenter);$('loading').remove();$('play').disabled=false;focusCamera(false);select('side');},undefined,e=>{const msg=$('loading');msg.className='error';msg.textContent='Model se nepodařilo načíst. Obnovte stránku; textový návod je dostupný níže.';console.error(e);});
 requestAnimationFrame(frame);
}
function frame(now){requestAnimationFrame(frame);if(document.hidden)return;if(playing){progress=Math.min((now-startedAt)/4000,1);amount=Math.sin(progress*Math.PI*2)*current.max;if(progress>=1){playing=false;amount=0;}syncUI();}
 if(!model||!sceneVisible)return;applyMotion();if(cameraTransition){const u=Math.min((now-cameraTransition.start)/450,1),s=u*u*(3-2*u);camera.position.lerpVectors(cameraTransition.from,cameraTransition.position,s);controls.target.lerpVectors(cameraTransition.target,cameraTransition.to,s);camera.zoom=THREE.MathUtils.lerp(cameraTransition.zoom,1,s);camera.lookAt(controls.target);configureFrustum();if(u===1)cameraTransition=null;}
 controls.update();scene.updateMatrixWorld(true);drawLabels();renderer.render(scene,camera);if(mode==='cabinet'&&zoomViewport.clientWidth)zoomRenderer.render(zoomScene,zoomCamera);
}
select('side');document.body.dataset.view='detail';
try{init();}catch(e){$('loading').className='error';$('loading').textContent='3D zobrazení vyžaduje WebGL. Textový průvodce zůstává k dispozici.';console.error(e);}
const ctx=document.modelContext;
if(ctx?.registerTool){const lifecycle=new AbortController();addEventListener('pagehide',()=>lifecycle.abort(),{once:true});Promise.resolve(ctx.registerTool({name:'explore_hinge_control',description:'Select one of the three adjustment screws and optionally show the magnified door view.',inputSchema:{type:'object',properties:{control:{type:'string',enum:lessons.map(l=>l.id)},view:{type:'string',enum:['detail','cabinet']}},required:['control'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||!lessons.some(l=>l.id===input.control)||input.view&&!['detail','cabinet'].includes(input.view))throw Error('Invalid hinge control or view');select(input.control);if(input.view)setMode(input.view);return{control:current.id,title:current.title,view:mode,modelLoaded:!!model};}},{signal:lifecycle.signal})).catch(()=>{});}

