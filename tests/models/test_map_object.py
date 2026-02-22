import pytest

from map_editor.models.map_object import MapObject, ObjectShape


class TestAutoId:
    def test_auto_id_starts_at_one(self):
        # reset_object_ids autouse fixture resets counter to 0 before each test
        obj = MapObject(name="First")
        assert obj.object_id == 1

    def test_auto_id_increments(self):
        a = MapObject(name="A")
        b = MapObject(name="B")
        c = MapObject(name="C")
        assert a.object_id == 1
        assert b.object_id == 2
        assert c.object_id == 3

    def test_reset_id_counter(self):
        MapObject(name="X")
        MapObject(name="Y")
        MapObject.reset_id_counter(0)
        obj = MapObject(name="Z")
        assert obj.object_id == 1

    def test_reset_id_counter_to_specific_value(self):
        MapObject.reset_id_counter(99)
        obj = MapObject(name="High")
        assert obj.object_id == 100


class TestFactoryMethods:
    def test_make_point_shape(self):
        obj = MapObject.make_point("Spawn", x=10.0, y=20.0)
        assert obj.shape == ObjectShape.POINT

    def test_make_point_position(self):
        obj = MapObject.make_point("Spawn", x=10.0, y=20.0)
        assert obj.x == 10.0
        assert obj.y == 20.0

    def test_make_point_zero_size(self):
        obj = MapObject.make_point("Spawn", x=0.0, y=0.0)
        assert obj.width == 0.0
        assert obj.height == 0.0

    def test_make_point_name_and_type(self):
        obj = MapObject.make_point("Guard", x=0, y=0, object_type="NPC")
        assert obj.name == "Guard"
        assert obj.object_type == "NPC"

    def test_make_rect_shape(self):
        obj = MapObject.make_rect("Zone", x=0, y=0, width=64, height=32)
        assert obj.shape == ObjectShape.RECTANGLE

    def test_make_rect_dimensions(self):
        obj = MapObject.make_rect("Zone", x=5.0, y=10.0, width=64.0, height=32.0)
        assert obj.x == 5.0
        assert obj.y == 10.0
        assert obj.width == 64.0
        assert obj.height == 32.0

    def test_make_tile_object_shape(self):
        obj = MapObject.make_tile_object("Chest", x=32, y=64, gid=5)
        assert obj.shape == ObjectShape.TILE

    def test_make_tile_object_gid(self):
        obj = MapObject.make_tile_object("Chest", x=0, y=0, gid=5)
        assert obj.gid == 5

    def test_make_point_properties(self):
        obj = MapObject.make_point("Trigger", x=0, y=0, properties={"key": "val"})
        assert obj.properties == {"key": "val"}


class TestMutation:
    def test_move_to(self):
        obj = MapObject.make_point("A", x=0.0, y=0.0)
        obj.move_to(100.0, 200.0)
        assert obj.x == 100.0
        assert obj.y == 200.0

    def test_set_and_get_property(self):
        obj = MapObject(name="NPC")
        obj.set_property("dialog", "Hello!")
        assert obj.get_property("dialog") == "Hello!"

    def test_get_property_default(self):
        obj = MapObject(name="NPC")
        assert obj.get_property("missing") is None
        assert obj.get_property("missing", default=42) == 42

    def test_get_property_overwrites(self):
        obj = MapObject(name="NPC")
        obj.set_property("hp", 10)
        obj.set_property("hp", 99)
        assert obj.get_property("hp") == 99

    def test_visible_default(self):
        obj = MapObject(name="X")
        assert obj.visible is True
