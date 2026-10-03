FeatureScript 2796;
import(path : "onshape/std/common.fs", version : "2796.0");
// Replace the two lines above with the ones Onshape writes in a new Feature Studio.

// One gravity well as a kit: separate rings with walled, numbered sectors, a
// hub and radial arms that lock the rings in place, and the lane markers that
// stand in grooves cut into a band outside the outer ring's track. Sectors are numbered from 0 and run
// clockwise (RULES.md: "numbered 0-23 and increase in the direction of drift").
// The black hole is 5 rings, a planet 4; insert the feature once per well.
//
// Assembly: the arms lie on the table and plug under the hub. Every ring sits
// on them over notches cut in its underside, and a tooth on each arm fills
// every gap between rings, so the rings cannot slide or turn. A ring too big
// for the bed is cut into segments on arm lines; the arms under the joints
// hold the segments together. Each lane marker drops into its own groove,
// which stops short of the arms, so the groove holds it both ways.
//
// Parts: "Ring k" (or "Ring k.j" per segment) with its numbers as a composite
// part beside it (each number named "Ring k sector s"), "Hub" (with a centre
// peg the planet or black hole sits on), "Arm j" and "Lane a-b".

export enum NumberStyle
{
    annotation { "Name" : "Inlaid (flush, multicolour)" }
    INLAID,
    annotation { "Name" : "Raised" }
    RAISED,
    annotation { "Name" : "Engraved" }
    ENGRAVED
}

// The press's inks (ui/src/design/press.ts), plus the accretion orange and
// two plain filament colours. Onshape has no colour parameter, so colours are
// picked from this list; they only tint the model, the filament is yours.
export enum Ink
{
    annotation { "Name" : "Red" }
    RED,
    annotation { "Name" : "Teal (Alpha)" }
    TEAL,
    annotation { "Name" : "Ochre (Beta)" }
    OCHRE,
    annotation { "Name" : "Violet (Gamma)" }
    VIOLET,
    annotation { "Name" : "Cream" }
    CREAM,
    annotation { "Name" : "Ink black" }
    INK,
    annotation { "Name" : "Orange" }
    ORANGE,
    annotation { "Name" : "Yellow" }
    YELLOW,
    annotation { "Name" : "White" }
    WHITE
}

function inkColor(ink is Ink) returns Color
{
    if (ink == Ink.RED)
        return color(0.824, 0.106, 0.2);
    if (ink == Ink.TEAL)
        return color(0.055, 0.486, 0.58);
    if (ink == Ink.OCHRE)
        return color(0.753, 0.478, 0.078);
    if (ink == Ink.VIOLET)
        return color(0.541, 0.31, 0.722);
    if (ink == Ink.CREAM)
        return color(0.914, 0.875, 0.78);
    if (ink == Ink.INK)
        return color(0.078, 0.086, 0.102);
    if (ink == Ink.ORANGE)
        return color(0.867, 0.667, 0.471);
    if (ink == Ink.YELLOW)
        return color(0.98, 0.85, 0.35);
    return color(0.97, 0.97, 0.97);
}

export enum Planet
{
    annotation { "Name" : "Alpha" }
    ALPHA,
    annotation { "Name" : "Beta" }
    BETA,
    annotation { "Name" : "Gamma" }
    GAMMA
}

export enum LaneSet
{
    annotation { "Name" : "None" }
    NONE,
    annotation { "Name" : "Black hole (every 4 sectors, all round)" }
    BLACK_HOLE,
    annotation { "Name" : "Planet (sectors 4-7 and 16-19)" }
    PLANET,
    annotation { "Name" : "Custom" }
    CUSTOM
}

const RING_COUNT_BOUNDS = { (unitless) : [1, 5, 12] } as IntegerBoundSpec;
const SECTOR_COUNT_BOUNDS = { (unitless) : [3, 24, 72] } as IntegerBoundSpec;
const FIRST_NUMBER_BOUNDS = { (unitless) : [0, 0, 999] } as IntegerBoundSpec;
const ARM_COUNT_BOUNDS = { (unitless) : [0, 6, 24] } as IntegerBoundSpec;
const ARM_OFFSET_BOUNDS = { (unitless) : [0, 0, 71] } as IntegerBoundSpec;
const LANE_START_BOUNDS = { (unitless) : [0, 0, 71] } as IntegerBoundSpec;
const LANE_SECTORS_BOUNDS = { (unitless) : [1, 4, 72] } as IntegerBoundSpec;
const START_ANGLE_BOUNDS = { (degree) : [-360, 90, 360] } as AngleBoundSpec;
const FIRST_RADIUS_BOUNDS = { (millimeter) : [1, 60, 2000] } as LengthBoundSpec;
const PITCH_BOUNDS = { (millimeter) : [1, 18, 500] } as LengthBoundSpec;
const GAP_BOUNDS = { (millimeter) : [0.5, 3, 100] } as LengthBoundSpec;
const THICKNESS_BOUNDS = { (millimeter) : [1, 4, 50] } as LengthBoundSpec;
const WALL_HEIGHT_BOUNDS = { (millimeter) : [0, 1.2, 20] } as LengthBoundSpec;
const WALL_WIDTH_BOUNDS = { (millimeter) : [0.4, 1.2, 10] } as LengthBoundSpec;
const NUMBER_DEPTH_BOUNDS = { (millimeter) : [0.1, 0.6, 10] } as LengthBoundSpec;
const NUMBER_HEIGHT_BOUNDS = { (millimeter) : [1, 5, 100] } as LengthBoundSpec;
const ARM_WIDTH_BOUNDS = { (millimeter) : [1, 6, 50] } as LengthBoundSpec;
const ARM_HEIGHT_BOUNDS = { (millimeter) : [0.4, 2, 20] } as LengthBoundSpec;
const HUB_INSERT_BOUNDS = { (millimeter) : [1, 15, 200] } as LengthBoundSpec;
const CLEARANCE_BOUNDS = { (millimeter) : [0, 0.2, 2] } as LengthBoundSpec;
const BED_BOUNDS = { (millimeter) : [50, 256, 2000] } as LengthBoundSpec;
const LANE_RAISE_BOUNDS = { (millimeter) : [0, 1.5, 20] } as LengthBoundSpec;
const WALL_TOP_WIDTH_BOUNDS = { (millimeter) : [0.2, 0.4, 10] } as LengthBoundSpec;
const PEG_DIAMETER_BOUNDS = { (millimeter) : [2, 8, 100] } as LengthBoundSpec;
const PEG_HEIGHT_BOUNDS = { (millimeter) : [0, 6, 100] } as LengthBoundSpec;
const INLAY_CLEARANCE_BOUNDS = { (millimeter) : [0, 0.1, 1] } as LengthBoundSpec;
const LANE_BAND_BOUNDS = { (millimeter) : [2, 6, 100] } as LengthBoundSpec;
const GROOVE_DEPTH_BOUNDS = { (millimeter) : [0.2, 1.5, 20] } as LengthBoundSpec;

annotation { "Feature Type Name" : "Orbit rings",
        "Feature Type Description" : "A gravity well as rings, hub, arms and lane markers that assemble" }
export const orbitRings = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Rings" }
        isInteger(definition.ringCount, RING_COUNT_BOUNDS);

        annotation { "Name" : "Ring 1 centre radius" }
        isLength(definition.firstRadius, FIRST_RADIUS_BOUNDS);

        annotation { "Name" : "Ring pitch (centre to centre)" }
        isLength(definition.pitch, PITCH_BOUNDS);

        annotation { "Name" : "Gap between rings" }
        isLength(definition.gap, GAP_BOUNDS);

        annotation { "Name" : "Ring thickness" }
        isLength(definition.thickness, THICKNESS_BOUNDS);

        annotation { "Name" : "Sectors" }
        isInteger(definition.sectorCount, SECTOR_COUNT_BOUNDS);

        annotation { "Name" : "Sector 0 start edge angle" }
        isAngle(definition.startAngle, START_ANGLE_BOUNDS);

        annotation { "Name" : "Sectors run clockwise", "Default" : true }
        definition.clockwise is boolean;

        annotation { "Name" : "First number" }
        isInteger(definition.firstNumber, FIRST_NUMBER_BOUNDS);

        annotation { "Name" : "Sector wall height (0 for none)" }
        isLength(definition.wallHeight, WALL_HEIGHT_BOUNDS);

        annotation { "Name" : "Wall width" }
        isLength(definition.wallWidth, WALL_WIDTH_BOUNDS);

        annotation { "Name" : "Wall top width (chamfered from the wall width)" }
        isLength(definition.wallTopWidth, WALL_TOP_WIDTH_BOUNDS);

        annotation { "Name" : "Walls along the ring edges too", "Default" : true }
        definition.rims is boolean;

        annotation { "Name" : "Number style" }
        definition.numberStyle is NumberStyle;

        if (definition.numberStyle == NumberStyle.INLAID)
        {
            annotation { "Name" : "Number inlay clearance (0 for none)" }
            isLength(definition.inlayClearance, INLAY_CLEARANCE_BOUNDS);
        }

        annotation { "Name" : "Number depth" }
        isLength(definition.numberDepth, NUMBER_DEPTH_BOUNDS);

        annotation { "Name" : "Number height" }
        isLength(definition.numberHeight, NUMBER_HEIGHT_BOUNDS);

        annotation { "Name" : "Font", "Default" : "OpenSans-Bold.ttf" }
        definition.font is string;

        annotation { "Name" : "Number colour", "Default" : Ink.RED }
        definition.numberInk is Ink;

        annotation { "Name" : "Number tops point to the centre", "Default" : true }
        definition.topsInward is boolean;

        annotation { "Name" : "Arms (0 for none)" }
        isInteger(definition.armCount, ARM_COUNT_BOUNDS);

        annotation { "Name" : "First arm on sector edge" }
        isInteger(definition.armOffset, ARM_OFFSET_BOUNDS);

        annotation { "Name" : "Arm width" }
        isLength(definition.armWidth, ARM_WIDTH_BOUNDS);

        annotation { "Name" : "Arm height" }
        isLength(definition.armHeight, ARM_HEIGHT_BOUNDS);

        annotation { "Name" : "Arm length under the hub" }
        isLength(definition.hubInsert, HUB_INSERT_BOUNDS);

        // Preconditions can only branch on booleans and enums, so these always show.
        annotation { "Name" : "Centre peg diameter" }
        isLength(definition.pegDiameter, PEG_DIAMETER_BOUNDS);

        annotation { "Name" : "Centre peg height (0 for none)" }
        isLength(definition.pegHeight, PEG_HEIGHT_BOUNDS);

        annotation { "Name" : "Clearance" }
        isLength(definition.clearance, CLEARANCE_BOUNDS);

        annotation { "Name" : "Print bed size" }
        isLength(definition.bedSize, BED_BOUNDS);

        annotation { "Name" : "Lane markers" }
        definition.lanes is LaneSet;

        if (definition.lanes == LaneSet.CUSTOM)
        {
            annotation { "Name" : "Lane arcs", "Item name" : "lane", "Item label template" : "From sector #start" }
            definition.customLanes is array;
            for (var lane in definition.customLanes)
            {
                annotation { "Name" : "First sector" }
                isInteger(lane.start, LANE_START_BOUNDS);

                annotation { "Name" : "Sectors" }
                isInteger(lane.sectors, LANE_SECTORS_BOUNDS);
            }
        }

        if (definition.lanes == LaneSet.PLANET)
        {
            annotation { "Name" : "Planet (its lanes take its colour)" }
            definition.planet is Planet;
        }

        if (definition.lanes == LaneSet.CUSTOM)
        {
            annotation { "Name" : "Lane colour", "Default" : Ink.RED }
            definition.laneInk is Ink;
        }

        if (definition.lanes != LaneSet.NONE)
        {
            annotation { "Name" : "Lane band width (outside the outer ring's track)" }
            isLength(definition.laneBand, LANE_BAND_BOUNDS);

            annotation { "Name" : "Lane groove depth" }
            isLength(definition.grooveDepth, GROOVE_DEPTH_BOUNDS);

            annotation { "Name" : "Lane marker height over the rings" }
            isLength(definition.laneRaise, LANE_RAISE_BOUNDS);
        }
    }
    {
        const n = definition.ringCount;
        const sectors = definition.sectorCount;
        const step = 360 * degree / sectors;
        const turn = definition.clockwise ? -1 : 1;
        const edge = function(s) { return definition.startAngle + turn * s * step; };
        const top = definition.thickness;
        const gap = definition.gap;
        const c = definition.clearance;
        const halfTrack = (definition.pitch - gap) / 2;
        const walls = definition.wallHeight > 0 * meter;
        const arms = definition.armCount;
        const sectorsPerArm = arms > 0 ? sectors / arms : sectors;
        const armAngle = function(j) { return edge(definition.armOffset + j * sectorsPerArm); };

        var inner = [];
        var outer = [];
        for (var i = 0; i < n; i += 1)
        {
            const r = definition.firstRadius + i * definition.pitch;
            inner = append(inner, r - halfTrack);
            outer = append(outer, r + halfTrack);
        }
        // Lanes: arcs of the outer ring, each a groove in a band outside its
        // track with a marker standing in it.
        // Each arc: first sector, sector count, what it is, its colour. A lane
        // wears the colour of the planet it goes to or comes from, as on the
        // screen (engine/src/models/gravityWells.ts, ui/src/components/board/geometry.ts).
        var laneArcs = [];
        if (definition.lanes == LaneSet.BLACK_HOLE)
        {
            const blackHoleLanes = [["out to Beta", Ink.OCHRE], ["in from Alpha", Ink.TEAL], ["out to Gamma", Ink.VIOLET],
                    ["in from Beta", Ink.OCHRE], ["out to Alpha", Ink.TEAL], ["in from Gamma", Ink.VIOLET]];
            for (var s = 0; s < sectors; s += 4)
            {
                const lane = blackHoleLanes[(s / 4) % 6];
                laneArcs = append(laneArcs, [s, 4, lane[0], lane[1]]);
            }
        }
        else if (definition.lanes == LaneSet.PLANET)
        {
            const ink = definition.planet == Planet.ALPHA ? Ink.TEAL : (definition.planet == Planet.BETA ? Ink.OCHRE : Ink.VIOLET);
            laneArcs = [[4, 4, "arrivals", ink], [16, 4, "departures", ink]];
        }
        else if (definition.lanes == LaneSet.CUSTOM)
        {
            for (var lane in definition.customLanes)
                laneArcs = append(laneArcs, [lane.start, lane.sectors, "", definition.laneInk]);
        }
        const band = definition.lanes == LaneSet.NONE ? 0 * meter : definition.laneBand;
        const grooveInner = outer[n - 1] + definition.wallWidth;
        const grooveOuter = outer[n - 1] + band - definition.wallWidth;

        // The outer edge of each ring's part: the last one carries the lane band.
        var edgeOf = outer;
        edgeOf[n - 1] = outer[n - 1] + band;

        const hubRadius = inner[0] - gap;
        const armStart = hubRadius - definition.hubInsert;
        const armEnd = edgeOf[n - 1] + gap;

        if (walls && definition.wallTopWidth > definition.wallWidth)
            throw regenError("The wall top cannot be wider than its foot", ["wallTopWidth", "wallWidth"]);
        if (arms > 0 && definition.pegHeight > 0 * meter && definition.pegDiameter >= 2 * hubRadius)
            throw regenError("The centre peg is wider than the hub", ["pegDiameter"]);
        if (halfTrack <= definition.wallWidth)
            throw regenError("The gap leaves no track: the ring pitch must be wider than the gap", ["pitch", "gap"]);
        if (gap <= 2 * c)
            throw regenError("The gap must be wider than twice the clearance", ["gap", "clearance"]);
        if (inner[0] <= 0 * meter)
            throw regenError("Ring 1 reaches the centre: raise its radius or lower the pitch", ["firstRadius", "pitch"]);
        if (definition.numberStyle != NumberStyle.RAISED && definition.numberDepth >= top)
            throw regenError("Number depth must be less than the ring thickness", ["numberDepth", "thickness"]);
        if (arms > 0 && sectors % arms != 0)
            throw regenError("The sectors must divide evenly between the arms", ["armCount", "sectorCount"]);
        if (arms > 0 && definition.armHeight + c + 0.6 * millimeter > top)
            throw regenError("Rings need 0.6 mm over the arm notches: thicken the rings or lower the arms", ["thickness", "armHeight"]);
        if (arms > 0 && (hubRadius <= 0 * meter || armStart <= definition.armWidth))
            throw regenError("The arms meet under the hub: shorten the arm length under the hub or move ring 1 out",
                ["hubInsert", "firstRadius"]);
        if (band > 0 * meter && grooveOuter - grooveInner <= 2 * c + 0.8 * millimeter)
            throw regenError("The lane band is too narrow for a groove and its two lips", ["laneBand"]);
        if (band > 0 * meter && definition.grooveDepth + 0.6 * millimeter > top)
            throw regenError("Rings need 0.6 mm under the lane groove: thicken the rings or make the groove shallower",
                ["grooveDepth", "thickness"]);

        // Rings: the track, then the walls on every sector edge and along both rims.
        var rings = [];
        for (var i = 0; i < n; i += 1)
        {
            const ringId = id + ("ring" ~ (i + 1));
            var pieces = [annulus(context, ringId + "track", inner[i], edgeOf[i], 0 * meter, top)];
            if (walls)
            {
                // Walls are trapezoids in section: the wall width at the foot,
                // the top width at the crest. One spoke wall is drawn across the
                // radius at sector edge 0, run out along it, then turned onto
                // every other edge.
                const wallTop = top + definition.wallHeight;
                const foot = definition.wallWidth;
                const crest = definition.wallTopWidth;
                const a0 = edge(0);
                const radial = vector(cos(a0), sin(a0), 0);
                const spokeSketch = newSketchOnPlane(context, ringId + "spoke" + "sketch", {
                            "sketchPlane" : plane(vector(inner[i] * cos(a0), inner[i] * sin(a0), top), radial, vector(-sin(a0), cos(a0), 0))
                        });
                skPolyline(spokeSketch, "profile", {
                            "points" : [vector(-foot / 2, 0 * meter), vector(foot / 2, 0 * meter), vector(crest / 2, definition.wallHeight),
                                    vector(-crest / 2, definition.wallHeight), vector(-foot / 2, 0 * meter)]
                        });
                skSolve(spokeSketch);
                opExtrude(context, ringId + "spoke" + "extrude", {
                            "entities" : qSketchRegion(ringId + "spoke" + "sketch"),
                            "direction" : radial,
                            "endBound" : BoundingType.BLIND,
                            "endDepth" : outer[i] - inner[i]
                        });
                opDeleteBodies(context, ringId + "spoke" + "sketchDelete", { "entities" : qCreatedBy(ringId + "spoke" + "sketch", EntityType.BODY) });
                const spoke = qCreatedBy(ringId + "spoke" + "extrude", EntityType.BODY);
                var turns = [];
                var turnNames = [];
                for (var s = 1; s < sectors; s += 1)
                {
                    turns = append(turns, rotationAround(line(zPoint(0 * meter), vector(0, 0, 1)), turn * s * step));
                    turnNames = append(turnNames, "wall" ~ s);
                }
                opPattern(context, ringId + "spokeCopies", { "entities" : spoke, "transforms" : turns, "instanceNames" : turnNames });
                pieces = append(pieces, spoke);
                pieces = append(pieces, qCreatedBy(ringId + "spokeCopies", EntityType.BODY));

                // Rims: upright on the ring's edge, sloped toward the track; revolved.
                if (definition.rims)
                {
                    const rimSketch = newSketchOnPlane(context, ringId + "rims" + "sketch", {
                                "sketchPlane" : plane(zPoint(0 * meter), vector(0, -1, 0), vector(1, 0, 0))
                            });
                    skPolyline(rimSketch, "inner", {
                                "points" : [vector(inner[i], top), vector(inner[i] + foot, top), vector(inner[i] + crest, wallTop),
                                        vector(inner[i], wallTop), vector(inner[i], top)]
                            });
                    skPolyline(rimSketch, "outer", {
                                "points" : [vector(outer[i] - foot, top), vector(outer[i], top), vector(outer[i], wallTop),
                                        vector(outer[i] - crest, wallTop), vector(outer[i] - foot, top)]
                            });
                    skSolve(rimSketch);
                    opRevolve(context, ringId + "rims" + "revolve", {
                                "entities" : qSketchRegion(ringId + "rims" + "sketch"),
                                "axis" : line(zPoint(0 * meter), vector(0, 0, 1)),
                                "angleForward" : 360 * degree
                            });
                    opDeleteBodies(context, ringId + "rims" + "sketchDelete", { "entities" : qCreatedBy(ringId + "rims" + "sketch", EntityType.BODY) });
                    pieces = append(pieces, qCreatedBy(ringId + "rims" + "revolve", EntityType.BODY));
                }
                opBoolean(context, ringId + "union", { "tools" : qUnion(pieces), "operationType" : BooleanOperationType.UNION });
            }
            rings = append(rings, qUnion(pieces));
        }

        // Lane grooves in the outer ring's band. Each stops short of its ends,
        // leaving a wall between neighbours and clearing the arm notches.
        const laneEndTrim = (arms > 0 ? definition.armWidth / 2 + c : 0 * meter) + definition.wallWidth / 2;
        for (var l = 0; l < size(laneArcs); l += 1)
        {
            const grooveId = id + ("groove" ~ l);
            const trim = (laneEndTrim / grooveInner) * radian;
            const groove = arcPiece(context, grooveId, grooveInner, grooveOuter, top - definition.grooveDepth,
                top + definition.wallHeight + 1 * millimeter, edge(laneArcs[l][0]) + turn * trim,
                turn * (laneArcs[l][1] * step - 2 * trim));
            opBoolean(context, grooveId + "cut", {
                        "tools" : groove,
                        "targets" : rings[n - 1],
                        "operationType" : BooleanOperationType.SUBTRACTION
                    });
        }

        // Hub, and the notches the arms run in under the hub and every ring.
        var hub = qNothing();
        if (arms > 0)
        {
            fCylinder(context, id + "hub", {
                        "bottomCenter" : zPoint(0 * meter),
                        "topCenter" : zPoint(top),
                        "radius" : hubRadius
                    });
            hub = qCreatedBy(id + "hub", EntityType.BODY);

            // A peg in the middle of the hub for the planet or black hole to sit on.
            if (definition.pegHeight > 0 * meter)
            {
                fCylinder(context, id + "peg", {
                            "bottomCenter" : zPoint(top),
                            "topCenter" : zPoint(top + definition.pegHeight),
                            "radius" : definition.pegDiameter / 2
                        });
                hub = qUnion([hub, qCreatedBy(id + "peg", EntityType.BODY)]);
                opBoolean(context, id + "pegJoin", { "tools" : hub, "operationType" : BooleanOperationType.UNION });
            }

            const notchId = id + "notches";
            const sketch = newSketchOnPlane(context, notchId + "sketch", { "sketchPlane" : zPlane(-1 * millimeter) });
            for (var j = 0; j < arms; j += 1)
                radialRect(sketch, "notch" ~ j, armAngle(j), armStart - c, armEnd + 1 * millimeter, definition.armWidth / 2 + c);
            skSolve(sketch);
            const notches = extrudeRegions(context, notchId, definition.armHeight + c + 1 * millimeter);
            opBoolean(context, notchId + "cut", {
                        "tools" : notches,
                        "targets" : qUnion(append(rings, hub)),
                        "operationType" : BooleanOperationType.SUBTRACTION
                    });
        }

        // Numbers. A font's box is taller than its digits, so measure a "0"
        // set at the nominal height and scale every label by what it lost.
        const depth = definition.numberDepth;
        const numberZ = definition.numberStyle == NumberStyle.RAISED ? top : top - depth;
        const probe = labelBody(context, id + "probe", "0", 1, definition.font, definition.numberHeight, depth);
        const probeBox = evBox3d(context, { "topology" : probe, "tight" : true });
        const fontScale = definition.numberHeight / (probeBox.maxCorner[1] - probeBox.minCorner[1]);
        opDeleteBodies(context, id + "probeDelete", { "entities" : probe });

        const numberAt = function(i, s) { return qCreatedBy(id + ("label" ~ s) + ("ring" ~ (i + 1)), EntityType.BODY); };
        var allNumbers = [];
        for (var s = 0; s < sectors; s += 1)
        {
            const sectorNumber = definition.firstNumber + s;
            const labelId = id + ("label" ~ s);
            const source = labelBody(context, labelId, toString(sectorNumber), digitCount(sectorNumber), definition.font,
                definition.numberHeight * fontScale, depth);
            const extent = evBox3d(context, { "topology" : source, "tight" : true });
            const centre = (extent.minCorner + extent.maxCorner) / 2;
            const toOrigin = transform(vector(-centre[0], -centre[1], 0 * meter));

            // Text "up" is +y; turn it to face the centre (or away from it).
            const mid = definition.startAngle + turn * (s + 0.5) * step;
            const spin = definition.topsInward ? mid + 90 * degree : mid - 90 * degree;
            const zAxis = line(zPoint(0 * meter), vector(0, 0, 1));

            for (var i = 0; i < n; i += 1)
            {
                const r = definition.firstRadius + i * definition.pitch;
                opPattern(context, labelId + ("ring" ~ (i + 1)), {
                            "entities" : source,
                            "transforms" : [transform(vector(r * cos(mid), r * sin(mid), numberZ)) * rotationAround(zAxis, spin) * toOrigin],
                            "instanceNames" : ["number"]
                        });
                setProperty(context, { "entities" : numberAt(i, s), "propertyType" : PropertyType.NAME,
                            "value" : "Ring " ~ (i + 1) ~ " sector " ~ sectorNumber });
                allNumbers = append(allNumbers, numberAt(i, s));
            }
            opDeleteBodies(context, labelId + "sourceDelete", { "entities" : source });
        }
        if (definition.numberStyle != NumberStyle.RAISED)
        {
            // An inlay with clearance is cut by copies of the numbers grown by it
            // on every face, then lifted by it so the pocket floor stays put.
            const inlayGap = definition.numberStyle == NumberStyle.INLAID ? definition.inlayClearance : 0 * meter;
            var pocketTools = qUnion(allNumbers);
            if (inlayGap > 0 * meter)
            {
                opPattern(context, id + "pockets", {
                            "entities" : qUnion(allNumbers),
                            "transforms" : [identityTransform()],
                            "instanceNames" : ["pocket"]
                        });
                pocketTools = qCreatedBy(id + "pockets", EntityType.BODY);
                opOffsetFace(context, id + "pocketsGrow", {
                            "moveFaces" : qOwnedByBody(pocketTools, EntityType.FACE),
                            "offsetDistance" : inlayGap
                        });
                opTransform(context, id + "pocketsLift", {
                            "bodies" : pocketTools,
                            "transform" : transform(vector(0 * meter, 0 * meter, inlayGap))
                        });
            }
            opBoolean(context, id + "inlay", {
                        "tools" : pocketTools,
                        "targets" : qUnion(rings),
                        "operationType" : BooleanOperationType.SUBTRACTION,
                        "keepTools" : definition.numberStyle == NumberStyle.INLAID && inlayGap == 0 * meter
                    });
        }
        const keepsNumbers = definition.numberStyle != NumberStyle.ENGRAVED;

        // Segments: the fewest that fit the bed, cut on arm lines. Onshape wants
        // every operation under one parent id contiguous, so this pass has its own.
        for (var i = 0; i < n; i += 1)
        {
            const partsId = id + ("parts" ~ (i + 1));
            const segments = segmentCount(arms, inner[i], edgeOf[i], definition.bedSize);
            const span = sectors / segments;
            for (var j = 0; j < segments; j += 1)
            {
                const name = segments == 1 ? "Ring " ~ (i + 1) : "Ring " ~ (i + 1) ~ "." ~ (j + 1);
                var piece = rings[i];
                if (segments > 1)
                {
                    const segId = partsId + ("segment" ~ (j + 1));
                    opPattern(context, segId + "copy", {
                                "entities" : rings[i],
                                "transforms" : [identityTransform()],
                                "instanceNames" : ["segment"]
                            });
                    piece = qCreatedBy(segId + "copy", EntityType.BODY);
                    const cutter = wedge(context, segId + "cutter", edge(definition.armOffset + (j + 1) * span),
                        turn * (360 * degree - span * step), edgeOf[i], -1 * millimeter, top + definition.wallHeight + 2 * millimeter);
                    opBoolean(context, segId + "trim", {
                                "tools" : cutter,
                                "targets" : piece,
                                "operationType" : BooleanOperationType.SUBTRACTION
                            });
                }
                setProperty(context, { "entities" : piece, "propertyType" : PropertyType.NAME, "value" : name });
                setProperty(context, { "entities" : piece, "propertyType" : PropertyType.APPEARANCE, "value" : color(0.12, 0.12, 0.12) });

                if (keepsNumbers)
                {
                    var numbers = [];
                    for (var s = 0; s < sectors; s += 1)
                    {
                        const fromFirst = ((s - definition.armOffset) % sectors + sectors) % sectors;
                        if (floor(fromFirst / span) == j)
                            numbers = append(numbers, numberAt(i, s));
                    }
                    const composite = partsId + ("numbers" ~ (j + 1));
                    setProperty(context, { "entities" : qUnion(numbers), "propertyType" : PropertyType.APPEARANCE, "value" : inkColor(definition.numberInk) });
                    opCreateCompositePart(context, composite, { "bodies" : qUnion(numbers) });
                    setProperty(context, {
                                "entities" : qCreatedBy(composite, EntityType.BODY),
                                "propertyType" : PropertyType.NAME,
                                "value" : name ~ " numbers"
                            });
                }
            }
            if (segments > 1)
                opDeleteBodies(context, partsId + "uncut", { "entities" : rings[i] });
        }

        // Arms: a bar under everything, and a tooth filling each gap it crosses.
        if (arms > 0)
        {
            var gaps = [[hubRadius + c, inner[0] - c]];
            for (var i = 0; i + 1 < n; i += 1)
                gaps = append(gaps, [edgeOf[i] + c, inner[i + 1] - c]);
            gaps = append(gaps, [edgeOf[n - 1] + c, armEnd]);

            for (var j = 0; j < arms; j += 1)
            {
                const armId = id + ("arm" ~ (j + 1));
                const baseSketch = newSketchOnPlane(context, armId + "base" + "sketch", { "sketchPlane" : zPlane(0 * meter) });
                radialRect(baseSketch, "bar", armAngle(j), armStart, armEnd, definition.armWidth / 2);
                skSolve(baseSketch);
                const base = extrudeRegions(context, armId + "base", definition.armHeight);

                const teethSketch = newSketchOnPlane(context, armId + "teeth" + "sketch", { "sketchPlane" : zPlane(0 * meter) });
                for (var g = 0; g < size(gaps); g += 1)
                    radialRect(teethSketch, "tooth" ~ g, armAngle(j), gaps[g][0], gaps[g][1], definition.armWidth / 2);
                skSolve(teethSketch);
                const teeth = extrudeRegions(context, armId + "teeth", top);

                const arm = qUnion([base, teeth]);
                opBoolean(context, armId + "union", { "tools" : arm, "operationType" : BooleanOperationType.UNION });
                setProperty(context, { "entities" : arm, "propertyType" : PropertyType.NAME, "value" : "Arm " ~ (j + 1) });
                setProperty(context, { "entities" : arm, "propertyType" : PropertyType.APPEARANCE, "value" : inkColor(Ink.INK) });
            }
            setProperty(context, { "entities" : hub, "propertyType" : PropertyType.NAME, "value" : "Hub" });
            setProperty(context, { "entities" : hub, "propertyType" : PropertyType.APPEARANCE, "value" : inkColor(Ink.INK) });
        }

        // Lane markers: one per groove, a clearance smaller all round, standing
        // proud of the ring.
        for (var l = 0; l < size(laneArcs); l += 1)
        {
            const first = laneArcs[l][0];
            const count = laneArcs[l][1];
            const trim = ((laneEndTrim + c) / grooveInner) * radian;
            const marker = arcPiece(context, id + ("lane" ~ l), grooveInner + c, grooveOuter - c, top - definition.grooveDepth,
                top + definition.laneRaise, edge(first) + turn * trim, turn * (count * step - 2 * trim));
            const label = "Lane " ~ first ~ "-" ~ (first + count - 1) ~ (laneArcs[l][2] == "" ? "" : " " ~ laneArcs[l][2]);
            setProperty(context, { "entities" : marker, "propertyType" : PropertyType.NAME, "value" : label });
            setProperty(context, { "entities" : marker, "propertyType" : PropertyType.APPEARANCE, "value" : inkColor(laneArcs[l][3]) });
        }
    });

/** One label extruded upward from the world origin, its font box `boxHeight` tall. */
function labelBody(context is Context, id is Id, label is string, digits is number, font is string,
    boxHeight is ValueWithUnits, depth is ValueWithUnits) returns Query
{
    const sketch = newSketchOnPlane(context, id + "sketch", { "sketchPlane" : zPlane(0 * meter) });
    skText(sketch, "text", {
                "text" : label,
                "fontName" : font,
                "firstCorner" : vector(0 * meter, 0 * meter),
                "secondCorner" : vector(0.6 * digits * boxHeight, boxHeight)
            });
    skSolve(sketch);
    // Inner loops are the counters of 0, 6, 8 and 9: leave them out.
    opExtrude(context, id + "extrude", {
                "entities" : qSketchRegion(id + "sketch", true),
                "direction" : vector(0, 0, 1),
                "endBound" : BoundingType.BLIND,
                "endDepth" : depth
            });
    opDeleteBodies(context, id + "sketchDelete", { "entities" : qCreatedBy(id + "sketch", EntityType.BODY) });
    return qCreatedBy(id + "extrude", EntityType.BODY);
}

/** Extrudes every region of the sketch at `id + "sketch"` upward, then drops the sketch. */
function extrudeRegions(context is Context, id is Id, height is ValueWithUnits) returns Query
{
    opExtrude(context, id + "extrude", {
                "entities" : qSketchRegion(id + "sketch"),
                "direction" : vector(0, 0, 1),
                "endBound" : BoundingType.BLIND,
                "endDepth" : height
            });
    opDeleteBodies(context, id + "sketchDelete", { "entities" : qCreatedBy(id + "sketch", EntityType.BODY) });
    return qCreatedBy(id + "extrude", EntityType.BODY);
}

/** A flat ring between two radii. */
function annulus(context is Context, id is Id, rIn is ValueWithUnits, rOut is ValueWithUnits,
    zBottom is ValueWithUnits, zTop is ValueWithUnits) returns Query
{
    fCylinder(context, id + "outer", { "bottomCenter" : zPoint(zBottom), "topCenter" : zPoint(zTop), "radius" : rOut });
    fCylinder(context, id + "inner", { "bottomCenter" : zPoint(zBottom), "topCenter" : zPoint(zTop), "radius" : rIn });
    opBoolean(context, id + "cut", {
                "tools" : qCreatedBy(id + "inner", EntityType.BODY),
                "targets" : qCreatedBy(id + "outer", EntityType.BODY),
                "operationType" : BooleanOperationType.SUBTRACTION
            });
    return qCreatedBy(id + "outer", EntityType.BODY);
}

/** A stretch of flat ring: from `startAt`, turning `sweep` (signed), between two radii. */
function arcPiece(context is Context, id is Id, rIn is ValueWithUnits, rOut is ValueWithUnits,
    zBottom is ValueWithUnits, zTop is ValueWithUnits, startAt is ValueWithUnits, sweep is ValueWithUnits) returns Query
{
    const piece = annulus(context, id + "ring", rIn, rOut, zBottom, zTop);
    const rest = sweep > 0 * degree ? 360 * degree - sweep : -360 * degree - sweep;
    const cutter = wedge(context, id + "cutter", startAt + sweep, rest, rOut, zBottom - 1 * millimeter, zTop - zBottom + 2 * millimeter);
    opBoolean(context, id + "trim", {
                "tools" : cutter,
                "targets" : piece,
                "operationType" : BooleanOperationType.SUBTRACTION
            });
    return piece;
}

/** A pie slice from the centre, turning `sweep` (signed) from `startAt`, reaching well past `radius`. */
function wedge(context is Context, id is Id, startAt is ValueWithUnits, sweep is ValueWithUnits, radius is ValueWithUnits,
    zBottom is ValueWithUnits, height is ValueWithUnits) returns Query
{
    const sketch = newSketchOnPlane(context, id + "sketch", { "sketchPlane" : zPlane(zBottom) });
    const steps = ceil(abs(sweep) / (10 * degree));
    const reach = 2 * radius;
    var points = [vector(0 * meter, 0 * meter)];
    for (var i = 0; i <= steps; i += 1)
    {
        const a = startAt + sweep * i / steps;
        points = append(points, vector(cos(a), sin(a)) * reach);
    }
    points = append(points, vector(0 * meter, 0 * meter));
    skPolyline(sketch, "outline", { "points" : points });
    skSolve(sketch);
    return extrudeRegions(context, id, height);
}

/** A bar along the radius at `angle`, from r0 to r1, `halfWidth` either side. */
function radialRect(sketch is Sketch, name is string, angle is ValueWithUnits, r0 is ValueWithUnits, r1 is ValueWithUnits,
    halfWidth is ValueWithUnits)
{
    const radial = vector(cos(angle), sin(angle));
    const across = vector(-sin(angle), cos(angle)) * halfWidth;
    skPolyline(sketch, name, {
                "points" : [radial * r0 + across, radial * r1 + across, radial * r1 - across, radial * r0 - across, radial * r0 + across]
            });
}

/** The fewest segments, each a whole number of arm spans, that fit on the bed. */
function segmentCount(arms is number, rIn is ValueWithUnits, rOut is ValueWithUnits, bed is ValueWithUnits) returns number
{
    if (arms == 0)
        return 1;
    for (var s = 1; s <= arms; s += 1)
    {
        if (arms % s == 0 && sliceFits(rIn, rOut, 360 * degree / s, bed))
            return s;
    }
    return arms;
}

function sliceFits(rIn is ValueWithUnits, rOut is ValueWithUnits, span is ValueWithUnits, bed is ValueWithUnits) returns boolean
{
    if (span > 180.001 * degree)
        return 2 * rOut <= bed;
    if (span > 179.999 * degree)
        return 2 * rOut <= bed && rOut <= bed;
    return 2 * rOut * sin(span / 2) <= bed && rOut - rIn * cos(span / 2) <= bed;
}

function digitCount(value is number) returns number
{
    return value < 10 ? 1 : (value < 100 ? 2 : 3);
}

function zPoint(z is ValueWithUnits) returns Vector
{
    return vector(0 * meter, 0 * meter, z);
}

function zPlane(z is ValueWithUnits) returns Plane
{
    return plane(zPoint(z), vector(0, 0, 1), vector(1, 0, 0));
}
