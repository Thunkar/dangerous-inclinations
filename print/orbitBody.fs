FeatureScript 2796;
import(path : "onshape/std/common.fs", version : "2796.0");
// Replace the two lines above with the ones Onshape writes in a new Feature Studio.
// Keep this in its own Feature Studio: it repeats helpers orbitRings.fs has too.

// The body that sits on an Orbit rings hub, over its centre peg.
//
// Planet: a dome cut into solid bands by wavy boundaries, two colours
// alternating. The boundaries lean on a shared, tilted axis and each wanders
// off it (a seed reshuffles them), so they never line up. The waves key each
// band onto the one below. A bore runs up from
// the base through every band and stops inside the cap, so the hub's peg (or a
// longer dowel) lines the stack up.
//
// Black hole: the horizon is a sphere with its bottom cut flat to stand on the
// hub's peg. The accretion disc is flat, with rows of swirl streaks cut right
// through it (crescents that taper to points, fat toward their leading end and
// drifting inward as they go round, like matter falling in), and each streak
// has its own inlay: the slot's shape a clearance smaller all round, as thick
// as the disc. Everything prints flat in one
// colour. The disc goes on the hub, the inlays drop into their slots and rest
// on the hub, and the horizon drops through the disc's hole onto the peg; its
// belly, wider than the hole, holds the disc down.

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

export enum BodyKind
{
    annotation { "Name" : "Planet (wavy bands)" }
    PLANET,
    annotation { "Name" : "Black hole (accretion disc)" }
    BLACK_HOLE
}

const RADIUS_BOUNDS = { (millimeter) : [2, 25, 500] } as LengthBoundSpec;
const BASE_HEIGHT_BOUNDS = { (millimeter) : [0, 4, 100] } as LengthBoundSpec;
const PEG_DIAMETER_BOUNDS = { (millimeter) : [2, 8, 100] } as LengthBoundSpec;
const PEG_HEIGHT_BOUNDS = { (millimeter) : [0, 6, 100] } as LengthBoundSpec;
const CLEARANCE_BOUNDS = { (millimeter) : [0, 0.2, 2] } as LengthBoundSpec;
const BANDS_BOUNDS = { (unitless) : [1, 4, 20] } as IntegerBoundSpec;
const WAVES_BOUNDS = { (unitless) : [1, 5, 30] } as IntegerBoundSpec;
const AMPLITUDE_BOUNDS = { (millimeter) : [0, 2, 50] } as LengthBoundSpec;
const CENTRE_HEIGHT_BOUNDS = { (millimeter) : [0, 10, 500] } as LengthBoundSpec;
const DISC_OUTER_BOUNDS = { (millimeter) : [2, 46, 500] } as LengthBoundSpec;
const DISC_THICKNESS_BOUNDS = { (millimeter) : [0.4, 2, 20] } as LengthBoundSpec;
const STREAK_ROWS_BOUNDS = { (unitless) : [0, 3, 8] } as IntegerBoundSpec;
const STREAKS_PER_ROW_BOUNDS = { (unitless) : [1, 3, 12] } as IntegerBoundSpec;
const STREAK_WIDTH_BOUNDS = { (millimeter) : [1, 6, 50] } as LengthBoundSpec;
const STREAK_LENGTH_BOUNDS = { (degree) : [10, 110, 300] } as AngleBoundSpec;
const STREAK_INFALL_BOUNDS = { (millimeter) : [0, 3, 30] } as LengthBoundSpec;
const ROW_STAGGER_BOUNDS = { (degree) : [0, 40, 360] } as AngleBoundSpec;
const BAND_TILT_BOUNDS = { (degree) : [0, 12, 40] } as AngleBoundSpec;
const SEED_BOUNDS = { (unitless) : [0, 1, 1000] } as IntegerBoundSpec;

annotation { "Feature Type Name" : "Orbit body",
        "Feature Type Description" : "A banded planet or a black hole with its accretion disc, to sit on the Orbit rings hub" }
export const orbitBody = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Body" }
        definition.kind is BodyKind;

        annotation { "Name" : "Radius" }
        isLength(definition.radius, RADIUS_BOUNDS);

        annotation { "Name" : "Sits at height (the hub's top)" }
        isLength(definition.baseHeight, BASE_HEIGHT_BOUNDS);

        annotation { "Name" : "Hub peg diameter" }
        isLength(definition.pegDiameter, PEG_DIAMETER_BOUNDS);

        annotation { "Name" : "Hub peg height" }
        isLength(definition.pegHeight, PEG_HEIGHT_BOUNDS);

        annotation { "Name" : "Clearance" }
        isLength(definition.clearance, CLEARANCE_BOUNDS);

        if (definition.kind == BodyKind.PLANET)
        {
            annotation { "Name" : "Bands" }
            isInteger(definition.bands, BANDS_BOUNDS);

            annotation { "Name" : "Waves round the planet" }
            isInteger(definition.waves, WAVES_BOUNDS);

            annotation { "Name" : "Wave amplitude" }
            isLength(definition.amplitude, AMPLITUDE_BOUNDS);

            annotation { "Name" : "Band tilt (the planet's axis)" }
            isAngle(definition.bandTilt, BAND_TILT_BOUNDS);

            annotation { "Name" : "Variation seed" }
            isInteger(definition.seed, SEED_BOUNDS);

            annotation { "Name" : "Band colour (bottom band and every other)", "Default" : Ink.TEAL }
            definition.bandInk is Ink;

            annotation { "Name" : "Band colour (the others)", "Default" : Ink.CREAM }
            definition.otherBandInk is Ink;
        }
        else
        {
            annotation { "Name" : "Horizon centre above the base" }
            isLength(definition.centreHeight, CENTRE_HEIGHT_BOUNDS);

            annotation { "Name" : "Hub (the disc takes its size)", "Filter" : EntityType.BODY && BodyType.SOLID, "MaxNumberOfPicks" : 1 }
            definition.hub is Query;

            annotation { "Name" : "Disc outer radius (when no hub is picked)" }
            isLength(definition.discOuter, DISC_OUTER_BOUNDS);

            annotation { "Name" : "Disc thickness" }
            isLength(definition.discThickness, DISC_THICKNESS_BOUNDS);

            annotation { "Name" : "Streak rows (0 for none)" }
            isInteger(definition.streakRows, STREAK_ROWS_BOUNDS);

            annotation { "Name" : "Streaks per row" }
            isInteger(definition.streaksPerRow, STREAKS_PER_ROW_BOUNDS);

            annotation { "Name" : "Streak width (inner row; each row out is 15% narrower)" }
            isLength(definition.streakWidth, STREAK_WIDTH_BOUNDS);

            annotation { "Name" : "Streak length round the disc (inner row; each row out is 10% shorter)" }
            isAngle(definition.streakLength, STREAK_LENGTH_BOUNDS);

            annotation { "Name" : "Streak infall (how far one drifts inward along its length)" }
            isLength(definition.streakInfall, STREAK_INFALL_BOUNDS);

            annotation { "Name" : "Row stagger" }
            isAngle(definition.rowStagger, ROW_STAGGER_BOUNDS);

            annotation { "Name" : "Swirl clockwise (the board's drift)", "Default" : true }
            definition.swirlClockwise is boolean;
        }
    }
    {
        if (definition.kind == BodyKind.PLANET)
            planet(context, id + "planet", definition);
        else
            blackHole(context, id + "blackHole", definition);

        // Stand it on the hub.
        opTransform(context, id + "place", {
                    "bodies" : qBodyType(qCreatedBy(id, EntityType.BODY), BodyType.SOLID),
                    "transform" : transform(zPoint(definition.baseHeight))
                });
    });

function planet(context is Context, id is Id, definition is map)
{
    const r = definition.radius;
    const bands = definition.bands;
    const amplitude = definition.amplitude;
    const boreRadius = definition.pegDiameter / 2 + definition.clearance;
    const seed = definition.seed;
    const minGap = 1 * millimeter;

    // Boundary k (1 to bands - 1) is a wavy ring, z = its height + its wave(a),
    // lofted flat between a closed curve inside the bore and one outside the
    // dome (curves at the same heights loft cleanly; a loft that has to climb
    // does not), and then tilted whole about a level line through its height.
    // All lean the same way, the planet's tilted axis, each off it by a few
    // degrees so no two are quite parallel. The tilt dips one side, so the
    // heights are spread between the lowest that keeps the first boundary off
    // the base and the highest that leaves a cap. The wave shrinks with the
    // dome's radius at that height (near the top a small rise is a long way
    // across the surface); neighbouring boundaries carry different counts and
    // each a second, faster ripple. The seed reshuffles all of it.
    //
    // For the checks a tilted boundary at distance rho from the axis and angle a
    // is close enough to z = height + rho * tan(tilt) * cos(a - lean) + wave(a).
    // That is linear in rho, so two boundaries are closest on the axis or at
    // the rim, which is where the checks look.
    const jitter = function(k, salt) { return sin((k * 2.39996 + seed * 1.61803 + salt) * radian); };
    const lowest = r * tan(definition.bandTilt * 1.05) + amplitude + minGap;
    const highest = 0.78 * r;
    if (bands > 1 && lowest >= highest)
        throw regenError("The tilt leaves no room for the bands: tilt them less or lower the waves", ["bandTilt", "amplitude"]);
    const boundary = function(k)
    {
        const height = bands == 2 ? (lowest + highest) / 2 : lowest + (k - 1) * (highest - lowest) / (bands - 2);
        const waves = definition.waves + k % 2;
        return {
                "height" : height,
                "tilt" : definition.bandTilt * (1 + 0.05 * jitter(k, 0)),
                "lean" : seed * 73 * degree + 5 * degree * jitter(k, 1),
                "reach" : amplitude * sqrt(r * r - height * height) / r,
                "waves" : waves,
                "phase" : (k * 137.5 + seed * 59) * degree
            };
    };
    const wave = function(b, a)
    {
        return b.reach * (0.7 * sin(b.waves * a + b.phase) + 0.3 * sin((2 * b.waves + 1) * a + 2 * b.phase));
    };
    const zAt = function(b, rho, a) { return b.height + rho * tan(b.tilt) * cos(a - b.lean) + wave(b, a); };

    var boreTop = definition.pegHeight + definition.clearance;
    for (var k = 1; k < bands; k += 1)
    {
        const b = boundary(k);
        const below = k > 1 ? boundary(k - 1) : undefined;
        for (var m = 0; m < 144; m += 1)
        {
            const a = m * 2.5 * degree;
            boreTop = max(boreTop, zAt(b, boreRadius, a) + minGap);
            for (var rho in [0 * meter, r])
            {
                const under = below == undefined ? 0 * meter : zAt(below, rho, a);
                if (zAt(b, rho, a) - under < minGap)
                    throw regenError(k == 1 ? "The lowest band runs into the base: tilt the bands less or lower the waves"
                                : "Two bands cross: tilt them less, lower the waves or use fewer bands",
                        ["bandTilt", "amplitude", "bands"]);
            }
        }
    }
    if (boreTop + minGap >= sqrt(r * r - boreRadius * boreRadius))
        throw regenError("The peg bore would break through the top: use fewer bands, smaller waves or a bigger planet",
            ["bands", "amplitude", "radius"]);

    opSphere(context, id + "sphere", { "center" : zPoint(0 * meter), "radius" : r });
    fCylinder(context, id + "below", {
                "bottomCenter" : zPoint(-r - 1 * millimeter),
                "topCenter" : zPoint(0 * meter),
                "radius" : r + 1 * millimeter
            });
    fCylinder(context, id + "bore", {
                "bottomCenter" : zPoint(-1 * millimeter),
                "topCenter" : zPoint(boreTop),
                "radius" : boreRadius
            });
    opBoolean(context, id + "hollow", {
                "tools" : qUnion([qCreatedBy(id + "below", EntityType.BODY), qCreatedBy(id + "bore", EntityType.BODY)]),
                "targets" : qCreatedBy(id + "sphere", EntityType.BODY),
                "operationType" : BooleanOperationType.SUBTRACTION
            });

    // Each boundary is lofted flat, tilted, then splits every band below it
    // off the one above. Its outer curve reaches far enough out that the tilt,
    // which pulls it in, leaves it outside the dome.
    for (var k = 1; k < bands; k += 1)
    {
        const waveId = id + ("wave" ~ k);
        const b = boundary(k);
        const samples = 8 * (2 * b.waves + 1);
        const nearRho = boreRadius / 2;
        const farRho = r / cos(b.tilt) + 2 * millimeter;
        var near = [];
        var far = [];
        for (var m = 0; m < samples; m += 1)
        {
            const a = m * 360 * degree / samples;
            const z = b.height + wave(b, a);
            near = append(near, vector(nearRho * cos(a), nearRho * sin(a), z));
            far = append(far, vector(farRho * cos(a), farRho * sin(a), z));
        }
        // The same first and last point closes a fitted spline.
        near = append(near, near[0]);
        far = append(far, far[0]);
        opFitSpline(context, waveId + "near", { "points" : near });
        opFitSpline(context, waveId + "far", { "points" : far });
        opLoft(context, waveId + "surface", {
                    "profileSubqueries" : [qCreatedBy(waveId + "near", EntityType.EDGE), qCreatedBy(waveId + "far", EntityType.EDGE)],
                    "bodyType" : ToolBodyType.SURFACE
                });
        opDeleteBodies(context, waveId + "curvesDelete", {
                    "entities" : qUnion([qCreatedBy(waveId + "near", EntityType.BODY), qCreatedBy(waveId + "far", EntityType.BODY)])
                });
        // Turning about this line lifts the side the boundary leans toward.
        opTransform(context, waveId + "tilt", {
                    "bodies" : qCreatedBy(waveId + "surface", EntityType.BODY),
                    "transform" : rotationAround(line(zPoint(b.height), vector(sin(b.lean), -cos(b.lean), 0)), b.tilt)
                });
        opSplitPart(context, waveId + "split", {
                    "targets" : qBodyType(qCreatedBy(id, EntityType.BODY), BodyType.SOLID),
                    "tool" : qCreatedBy(waveId + "surface", EntityType.BODY),
                    "keepTools" : false
                });
    }

    // Name the bands bottom up and alternate the two colours.
    var stack = [];
    for (var piece in evaluateQuery(context, qBodyType(qCreatedBy(id, EntityType.BODY), BodyType.SOLID)))
        stack = append(stack, { "body" : piece, "z" : evBox3d(context, { "topology" : piece }).minCorner[2] });
    stack = sort(stack, function(a, b) { return (a.z - b.z) / meter; });
    for (var k = 0; k < size(stack); k += 1)
    {
        setProperty(context, { "entities" : stack[k].body, "propertyType" : PropertyType.NAME, "value" : "Band " ~ (k + 1) });
        setProperty(context, {
                    "entities" : stack[k].body,
                    "propertyType" : PropertyType.APPEARANCE,
                    "value" : inkColor(k % 2 == 0 ? definition.bandInk : definition.otherBandInk)
                });
    }
}

function blackHole(context is Context, id is Id, definition is map)
{
    const r = definition.radius;
    const c = definition.clearance;
    const centre = definition.centreHeight;
    const pegRadius = definition.pegDiameter / 2 + c;
    const thickness = definition.discThickness;
    // The disc is exactly the hub's size when a hub is picked.
    var outerR = definition.discOuter;
    if (!isQueryEmpty(context, definition.hub))
    {
        const hubBox = evBox3d(context, { "topology" : definition.hub });
        outerR = (hubBox.maxCorner[0] - hubBox.minCorner[0]) / 2;
    }

    if (centre >= r)
        throw regenError("The horizon's centre must sit lower than its radius, or nothing stands on the hub", ["centreHeight", "radius"]);
    if (sqrt(r * r - centre * centre) <= pegRadius + 1 * millimeter)
        throw regenError("The flat under the horizon is too small for the peg: lower its centre", ["centreHeight"]);
    if (thickness >= centre - 1 * millimeter)
        throw regenError("The disc must stay well below the horizon's middle, or its belly cannot hold it down",
            ["discThickness", "centreHeight"]);
    if (outerR <= r + 5 * millimeter)
        throw regenError("The disc must reach well past the horizon", ["discOuter", "radius", "hub"]);

    // The disc's hole is the horizon's width (plus the clearance) at the
    // disc's top: the sphere is narrower than that everywhere below, so it
    // drops through, and wider above, so it overhangs the disc.
    const hole = sqrt((r + c) * (r + c) - (centre - thickness) * (centre - thickness));

    // The horizon: a sphere cut flat on the hub, with the peg hole.
    opSphere(context, id + "sphere", { "center" : zPoint(centre), "radius" : r });
    fCylinder(context, id + "below", {
                "bottomCenter" : zPoint(centre - r - 1 * millimeter),
                "topCenter" : zPoint(0 * meter),
                "radius" : r + 1 * millimeter
            });
    fCylinder(context, id + "pegHole", {
                "bottomCenter" : zPoint(-1 * millimeter),
                "topCenter" : zPoint(definition.pegHeight + c),
                "radius" : pegRadius
            });
    const horizon = qCreatedBy(id + "sphere", EntityType.BODY);
    opBoolean(context, id + "carve", {
                "tools" : qUnion([qCreatedBy(id + "below", EntityType.BODY), qCreatedBy(id + "pegHole", EntityType.BODY)]),
                "targets" : horizon,
                "operationType" : BooleanOperationType.SUBTRACTION
            });

    const disc = annulus(context, id + "disc", hole, outerR, 0 * meter, thickness);

    // Swirl streaks, in rows between the hole and the rim. A streak runs
    // round the disc (u from 0 at its trailing end to 1 at its leading end),
    // drifting inward by the infall as it goes, and its width swells from a
    // point to its widest two thirds of the way along, then closes to a point
    // again: a comet with its head forward. Each row out is a little narrower
    // and shorter, and turned by the stagger so the rows do not line up.
    const margin = 2.5 * millimeter;
    const inner = hole + margin;
    const rows = definition.streakRows;
    const perRow = definition.streaksPerRow;
    if (rows > 0)
    {
        const band = (outerR - margin - inner) / rows;
        const turn = definition.swirlClockwise ? -1 : 1;
        const at = function(row, j, u)
        {
            const width = definition.streakWidth * (1 - 0.15 * row);
            const length = definition.streakLength * (1 - 0.1 * row);
            return {
                    "rho" : inner + band * (row + 0.5) + definition.streakInfall * (0.5 - u),
                    "angle" : j * 360 * degree / perRow + row * definition.rowStagger + turn * length * u,
                    "half" : width / 2 * (max(0, sin(180 * degree * ((1 - u) ^ 0.6))) ^ 0.6)
                };
        };
        // A streak's outline from uFrom to uTo, its half width less `shrink`.
        // An end where the width has closed to nothing is a single point.
        const samples = 60;
        const outline = function(row, j, uFrom, uTo, shrink)
        {
            var outside = [];
            var inside = [];
            for (var i = 0; i <= samples; i += 1)
            {
                const p = at(row, j, uFrom + (uTo - uFrom) * i / samples);
                const half = max(p.half - shrink, 0 * meter);
                outside = append(outside, vector((p.rho + half) * cos(p.angle), (p.rho + half) * sin(p.angle)));
                inside = append(inside, vector((p.rho - half) * cos(p.angle), (p.rho - half) * sin(p.angle)));
            }
            const pointed = shrink == 0 * meter;
            var result = outside;
            for (var i = pointed ? samples - 1 : samples; i >= (pointed ? 1 : 0); i -= 1)
                result = append(result, inside[i]);
            return append(result, outside[0]);
        };

        // Clear of the hole, the rim and each other, so the disc holds together.
        for (var row = 0; row < rows; row += 1)
        {
            for (var i = 0; i <= 40; i += 1)
            {
                const p = at(row, 0, i / 40);
                if (p.rho - p.half < hole + 1.5 * millimeter || p.rho + p.half > outerR - 1.5 * millimeter)
                    throw regenError("The streaks reach the hole or the rim: make them narrower or drift less",
                        ["streakWidth", "streakInfall", "streakRows"]);
            }
        }
        var streaks = [];
        for (var row = 0; row < rows; row += 1)
        {
            for (var j = 0; j < perRow; j += 1)
                streaks = append(streaks, [row, j]);
        }
        for (var x = 0; x < size(streaks); x += 1)
        {
            for (var y = x + 1; y < size(streaks); y += 1)
            {
                for (var i = 0; i <= 20; i += 1)
                {
                    const p = at(streaks[x][0], streaks[x][1], i / 20);
                    for (var k = 0; k <= 20; k += 1)
                    {
                        const q = at(streaks[y][0], streaks[y][1], k / 20);
                        const apart = norm(vector(p.rho * cos(p.angle) - q.rho * cos(q.angle), p.rho * sin(p.angle) - q.rho * sin(q.angle)));
                        if (apart - p.half - q.half < 1.5 * millimeter)
                            throw regenError("Two streaks run into each other: fewer, narrower or shorter streaks, or more stagger",
                                ["streaksPerRow", "streakWidth", "streakLength", "rowStagger"]);
                    }
                }
            }
        }

        // Slots, cut through the disc.
        const slotsId = id + "slots";
        const slotSketch = newSketchOnPlane(context, slotsId + "sketch", { "sketchPlane" : zPlane(-1 * millimeter) });
        for (var x = 0; x < size(streaks); x += 1)
            skPolyline(slotSketch, "slot" ~ x, { "points" : outline(streaks[x][0], streaks[x][1], 0, 1, 0 * meter) });
        skSolve(slotSketch);
        const slots = extrudeRegions(context, slotsId, thickness + 2 * millimeter);
        opBoolean(context, slotsId + "cut", { "tools" : slots, "targets" : disc, "operationType" : BooleanOperationType.SUBTRACTION });

        // Inlays: each slot a clearance smaller all round, its two points
        // stopped where it would get thinner than 0.6 mm.
        const inlaysId = id + "inlays";
        const inlaySketch = newSketchOnPlane(context, inlaysId + "sketch", { "sketchPlane" : zPlane(0 * meter) });
        for (var x = 0; x < size(streaks); x += 1)
        {
            const row = streaks[x][0];
            var uLow = 0;
            while (uLow < 0.5 && at(row, 0, uLow).half - c < 0.3 * millimeter)
                uLow += 0.005;
            var uHigh = 1;
            while (uHigh > 0.5 && at(row, 0, uHigh).half - c < 0.3 * millimeter)
                uHigh -= 0.005;
            skPolyline(inlaySketch, "inlay" ~ x, { "points" : outline(row, streaks[x][1], uLow, uHigh, c) });
        }
        skSolve(inlaySketch);
        const inlays = extrudeRegions(context, inlaysId, thickness);
        setProperty(context, { "entities" : inlays, "propertyType" : PropertyType.NAME, "value" : "Streak inlay" });
        setProperty(context, { "entities" : inlays, "propertyType" : PropertyType.APPEARANCE, "value" : inkColor(Ink.YELLOW) });
    }

    setProperty(context, { "entities" : horizon, "propertyType" : PropertyType.NAME, "value" : "Horizon" });
    setProperty(context, { "entities" : horizon, "propertyType" : PropertyType.APPEARANCE, "value" : inkColor(Ink.INK) });
    setProperty(context, { "entities" : disc, "propertyType" : PropertyType.NAME, "value" : "Accretion disc" });
    setProperty(context, { "entities" : disc, "propertyType" : PropertyType.APPEARANCE, "value" : inkColor(Ink.ORANGE) });
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

function zPoint(z is ValueWithUnits) returns Vector
{
    return vector(0 * meter, 0 * meter, z);
}

function zPlane(z is ValueWithUnits) returns Plane
{
    return plane(zPoint(z), vector(0, 0, 1), vector(1, 0, 0));
}
