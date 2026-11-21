import test from 'node:test';
import assert from 'node:assert/strict';
import { snapOpening, resizeWindow } from '../opening-tools.js';
const wall = { id:'wall', type:'wall', a:{x:100,y:200}, b:{x:900,y:200} };
const snap = point => ({ wall, rotation:0, point });
test('moving a flipped door along a wall preserves its direction and clamps the entire opening', () => {
  const door = { type:'door', x:500,y:200,widthInches:30,rotation:180,attachedWallId:'wall' };
  const moved = snapOpening(door,snap({x:650,y:200}),[wall],4,door);
  assert.equal(moved.rotation,180);
  assert.equal(moved.x,650);
  assert.equal(snapOpening(door,snap({x:100,y:200}),[wall],4,door).x,220);
  const vertical = { id:'vertical', type:'wall', a:{x:1000,y:100},b:{x:1000,y:900} };
  assert.equal(snapOpening(door,{wall:vertical,rotation:90,point:{x:1000,y:500}},[wall,vertical],4,door).rotation,270);
});
test('windows fit on wall centerlines including reversed walls and near endpoints', () => {
  const window = {type:'window',widthInches:30,rotation:0};
  const moved = snapOpening(window,snap({x:890,y:200}),[wall],4);
  assert.equal(moved.x,840); assert.equal(moved.y,200); assert.equal(moved.attachedWallId,'wall');
  const short = {...wall,b:{x:180,y:200}};
  const fitted = snapOpening(window,{wall:short,rotation:0,point:{x:160,y:200}},[short],4);
  assert.equal(fitted.widthInches,20); assert.equal(fitted.x,140);
});
test('window endpoint resizing holds the other endpoint and thickness steady', () => {
  const window = {type:'window',x:500,y:200,widthInches:30,heightInches:4.5,rotation:0,attachedWallId:'wall'};
  const start = resizeWindow(window,'start',{x:400,y:230},4,[wall]);
  assert.deepEqual(start,{x:480,y:200,widthInches:40});
  assert.equal(start.x + start.widthInches*2,560);
  assert.equal(resizeWindow(window,'end',{x:999,y:200},4,[wall]).x,670);
  const vertical = {...window,x:200,y:500,rotation:90,attachedWallId:null};
  const end = resizeWindow(vertical,'end',{x:180,y:620},4);
  assert.ok(Math.abs(end.x-200)<1e-8); assert.equal(end.y,530); assert.equal(end.widthInches,45);
  assert.deepEqual(resizeWindow(window,'thickness',{x:500,y:210},4),{heightInches:5});
  assert.deepEqual(resizeWindow(window,'thickness',{x:500,y:247},4,[],{x:500,y:247}),{heightInches:4.5});
});
