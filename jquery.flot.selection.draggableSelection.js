/*
Flot plugin for draggable and resizable selecting of regions.


*/

(function ($) {
    function init(plot) {
        var selection = {
                first: { x: -1, y: -1}, second: { x: -1, y: -1},
                show: false,
                active: false,
                resizingActive: false,
                panning : false,
                mousePos : null,
                mousePosRight: null,
                mousePosLeft: null         
            };

        var savedhandlers = {};
        var selector;
        var mouseUpHandler = null;
        
        var o = plot.getOptions();
        var offset = plot.getPlaceholder().offset();
        var plotOffset = plot.getPlotOffset();


        function onMouseMove(e) {
            if (selection.active) {
                updateSelection(e);
                plot.getPlaceholder().trigger("plotselecting", [ getSelection() ]);
            }
        }
        
        function onMouseDown(e) {
            if (e.which != 1)  // only accept left-click
                return;
            
            // cancel out any text selections
            document.body.focus();

            // prevent text selection and drag in old-school browsers
            if (document.onselectstart !== undefined && savedhandlers.onselectstart == null) {
                savedhandlers.onselectstart = document.onselectstart;
                document.onselectstart = function () { return false; };
            }

            if (document.ondrag !== undefined && savedhandlers.ondrag == null) {
                savedhandlers.ondrag = document.ondrag;
                document.ondrag = function () { return false; };
            }

            selection.resizingActive = (pointOnSelector(e, 'right') || pointOnSelector(e, 'left'));
            selector = pointOnSelector(e, 'right');

            selection.active = true;
            selection.panning = pointInSelection(e);

            if (selection.panning) {
               selection.mousePos = e;
            }

            // this is a bit silly, but we have to use a closure to be
            // able to whack the same handler again
            mouseUpHandler = function (e) { onMouseUp(e); };
            
            $(document).one("mouseup", mouseUpHandler);
        }

        function onMouseUp(e) {
            mouseUpHandler = null;
            
            // no more dragging
            selection.active = false;
            selection.resizingActive = false;
            updateSelection(e);

            if (selectionIsSane()) {
                triggerSelectedEvent();
            }

            return false;
        }

        function getSelection() {
            if (!selectionIsSane()) return null;

            var r = {}, c1 = selection.first, c2 = selection.second;
            $.each(plot.getAxes(), function (name, axis) {
                if (axis.used) {
                    var p1 = axis.c2p(c1[axis.direction]), p2 = axis.c2p(c2[axis.direction]); 
                    r[name] = { from: Math.min(p1, p2), to: Math.max(p1, p2) };
                }
            });
            return r;
        }

        function triggerSelectedEvent() {
            var r = getSelection();

            plot.getPlaceholder().trigger("plotselected", [ r ]);

            // backwards-compat stuff, to be removed in future
            if (r.xaxis && r.yaxis)
                plot.getPlaceholder().trigger("selected", [ { x1: r.xaxis.from, y1: r.yaxis.from, x2: r.xaxis.to, y2: r.yaxis.to } ]);
        }

        function clamp(min, value, max) {
            return value < min ? min: (value > max ? max: value);
        }

        function pointInSelection(e) {
            if (!selection.show) return false;

            var pos = {};
            pos.x = clamp(0, e.pageX - offset.left - plotOffset.left, plot.width());
            pos.y = clamp(0, e.pageY - offset.top - plotOffset.top, plot.height());

            return ((pos.x >= selection.first.x) && (pos.x <= selection.second.x)) ||
                   ((pos.x >= selection.second.x) && (pos.x <= selection.first.x))
        }

        function pointOnSelector(e, selector) {
            if (!selection.show) return false;

            var pos = {};
            pos.x = clamp(0, e.pageX - offset.left - plotOffset.left, plot.width());
            pos.y = clamp(0, e.pageY - offset.top - plotOffset.top, plot.height());

            var selectorWidth = o.draggableSelection.selector.width;
            
            return selector == 'right' ?
                ((pos.x >= selection.first.x - selectorWidth) && (pos.x <= selection.first.x)):
                ((pos.x >= selection.second.x) && (pos.x <= selection.second.x + selectorWidth));
        }

        function offsetSelection(delta, isRightSelector) {
            if (isRightSelector || isRightSelector == null) selection.first.x += delta;
            if (!isRightSelector || isRightSelector == null) selection.second.x += delta;         
        }

        function updateSelection(pos) {

            if (pos.pageX == null) return;

            if (selection.resizingActive) {

                var delta = {};
                

                function calculateDelta(previousMousePosition) {
                    return previousMousePosition ?
                        pos.pageX - previousMousePosition.pageX : 0;
                }

                var minimumSelection = o.draggableSelection.minimumSelection;

                // if right selector
                if (selector) {
                    delta = calculateDelta(selection.mousePosRight);

                    var testRight = selection.first.x + delta;
                    var selectionWidth = selection.second.x - testRight;

                    if (selectionWidth >= minimumSelection || (selectionWidth <= minimumSelection && delta < 0)) {
                        offsetSelection(delta, selector);
                        selection.mousePosRight = pos;
                    }
                } else {
                    delta = calculateDelta(selection.mousePosLeft);
                    
                    var testLeft = selection.second.x + delta;
                    var selectionWidth = testLeft - selection.first.x;

                    if (selectionWidth >= minimumSelection || (selectionWidth <= minimumSelection && delta > 0)) {
                        offsetSelection(delta, selector);
                        selection.mousePosLeft = pos;
                    }
                }

            } else if (selection.panning) {

                var delta = pos.pageX - selection.mousePos.pageX;

                // update last selector mouse selection
                if (selection.mousePosRight && selection.mousePosRight.pageX) 
                    selection.mousePosRight.pageX += delta;

                if (selection.mousePosLeft && selection.mousePosLeft.pageX) 
                    selection.mousePosLeft.pageX += delta;

                offsetSelection(delta);
               
                selection.mousePos = pos;
            }
            
            if (selectionIsSane()) {
                selection.show = true;
                plot.triggerRedrawOverlay();
            }
        }

        function clearSelection(preventEvent) {
            if (selection.show) {
                selection.show = false;
                plot.triggerRedrawOverlay();
                if (!preventEvent)
                    plot.getPlaceholder().trigger("plotunselected", [ ]);
            }
        }

        // function taken from markings support in Flot
        function extractRange(ranges, coord) {
            var axis, from, to, key, axes = plot.getAxes();

            for (var k in axes) {
                axis = axes[k];
                if (axis.direction == coord) {
                    key = coord + axis.n + "axis";
                    if (!ranges[key] && axis.n == 1)
                        key = coord + "axis"; // support x1axis as xaxis
                    if (ranges[key]) {
                        from = ranges[key].from;
                        to = ranges[key].to;
                        break;
                    }
                }
            }

            // backwards-compat stuff - to be removed in future
            if (!ranges[key]) {
                axis = coord == "x" ? plot.getXAxes()[0] : plot.getYAxes()[0];
                from = ranges[coord + "1"];
                to = ranges[coord + "2"];
            }

            // auto-reverse as an added bonus
            if (from != null && to != null && from > to) {
                var tmp = from;
                from = to;
                to = tmp;
            }
            
            return { from: from, to: to, axis: axis };
        }
        
        function setSelection(ranges, preventEvent) {
            var axis, range;

            range = extractRange(ranges, "x");

            selection.first.x = range.axis.p2c(range.from);
            selection.second.x = range.axis.p2c(range.to);
            selection.first.y = 0;
            selection.second.y = plot.height();

            selection.show = true;
            plot.triggerRedrawOverlay();
            if (!preventEvent && selectionIsSane())
                triggerSelectedEvent();
        }

        function selectionIsSane() {
            var minSize = o.draggableSelection.minimumSelection;
            return Math.abs(selection.second.x - selection.first.x) >= minSize &&
                Math.abs(selection.second.y - selection.first.y) >= minSize;
        }

        plot.clearDraggableSelection = clearSelection;
        plot.setDraggableSelection = setSelection;
        plot.getDraggableSelection = getSelection;

        plot.getDraggableSelecting = function() { return selection.active;};

        plot.hooks.bindEvents.push(function(plot, eventHolder) {
            if (o.draggableSelection != null) {
                eventHolder.mousemove(onMouseMove);
                eventHolder.mousedown(onMouseDown);
            }
        });

        plot.hooks.drawOverlay.push(function (plot, ctx) {
            // draw selection
            if (selection.show && selectionIsSane()) {

                ctx.save();
                ctx.translate(plotOffset.left, plotOffset.top);

                var selectionWidth = selection.second.x - selection.first.x;

                var c = $.color.parse(o.draggableSelection.color);

                var x = Math.min(selection.first.x, selection.second.x),
                    y = Math.min(selection.first.y, selection.second.y),
                    w = Math.abs(selectionWidth),
                    h = Math.abs(selection.second.y - selection.first.y);


                var selector = o.draggableSelection.selector;

                // If color is not defined for selector use default
                selector.color ? null : selector.color = c.toString();

                // Draw right selector
                ctx.fillStyle = selector.color;
                ctx.fillRect(x - selector.width, y, selector.width, h);

                // Draw left selector
                ctx.fillStyle = selector.color;
                ctx.fillRect(x + selectionWidth, y, selector.width, h);


                // Draw selection
                ctx.fillStyle = $.color.parse("red").scale('a', 0).toString();
                ctx.fillRect(x, y, w, h);

                
                ctx.fillStyle = c.scale('a', 0.3).toString();

                // Draw overlay before right selector
                ctx.fillRect(0, 0, selection.first.x, h);

                // Draw overlay before left selector
                ctx.fillRect(selection.second.x, 0, (plot.width() - selection.second.x), h);

                var linesPositionY = h/2 - selector.linesHeight/2;

                // Draw lines in left selector
                ctx.fillStyle = selector.linesColor;
                ctx.fillRect(x + selectionWidth + 2, linesPositionY, 2, selector.linesHeight);
                ctx.fillRect(x + selectionWidth + 6, linesPositionY, 2, selector.linesHeight);

                // Draw lines in right selector
                ctx.fillRect(selection.first.x - selector.width + 2, linesPositionY, 2, selector.linesHeight);
                ctx.fillRect(selection.first.x - selector.width + 6, linesPositionY, 2, selector.linesHeight);

                ctx.restore();
            }
        });
        
        plot.hooks.shutdown.push(function (plot, eventHolder) {
            eventHolder.unbind("mousemove", onMouseMove);
            eventHolder.unbind("mousedown", onMouseDown);
            
            if (mouseUpHandler)
                $(document).unbind("mouseup", mouseUpHandler);
        });

    }

    $.plot.plugins.push({
        init: init,
        options: {
            draggableSelection: {
                color: "#CCC",
                selector: {
                    width: 10,
                    linesHeight: 20,
                    linesColor: "#B3B3B3"
                },
                minimumSelection: 40
            }
        },
        name: 'draggableSelection',
        version: '0.1'
    });
})(jQuery);